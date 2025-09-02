/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import type {
  StartSessionEvent,
  UserPromptEvent,
  ToolCallEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
  LoopDetectedEvent,
  NextSpeakerCheckEvent,
  SlashCommandEvent,
  MalformedJsonResponseEvent,
  IdeConnectionEvent,
  ConversationFinishedEvent,
  KittySequenceOverflowEvent,
  ChatCompressionEvent,
  FileOperationEvent,
  InvalidChunkEvent,
  ContentRetryEvent,
  ContentRetryFailureEvent,
} from '../types.js';
import { EventMetadataKey } from './event-metadata-key.js';
import type { Config } from '../../config/config.js';
import { InstallationManager } from '../../utils/installationManager.js';
import { UserAccountManager } from '../../utils/userAccountManager.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import { FixedDeque } from 'mnemonist';
import { GIT_COMMIT_INFO, CLI_VERSION } from '../../generated/git-commit.js';
import { DetectedIde, detectIdeFromEnv } from '../../ide/detect-ide.js';

export enum EventNames {
  START_SESSION = 'start_session',
  NEW_PROMPT = 'new_prompt',
  TOOL_CALL = 'tool_call',
  FILE_OPERATION = 'file_operation',
  API_REQUEST = 'api_request',
  API_RESPONSE = 'api_response',
  API_ERROR = 'api_error',
  END_SESSION = 'end_session',
  FLASH_FALLBACK = 'flash_fallback',
  LOOP_DETECTED = 'loop_detected',
  NEXT_SPEAKER_CHECK = 'next_speaker_check',
  SLASH_COMMAND = 'slash_command',
  MALFORMED_JSON_RESPONSE = 'malformed_json_response',
  IDE_CONNECTION = 'ide_connection',
  KITTY_SEQUENCE_OVERFLOW = 'kitty_sequence_overflow',
  CHAT_COMPRESSION = 'chat_compression',
  CONVERSATION_FINISHED = 'conversation_finished',
  INVALID_CHUNK = 'invalid_chunk',
  CONTENT_RETRY = 'content_retry',
  CONTENT_RETRY_FAILURE = 'content_retry_failure',
}

export interface LogResponse {
  nextRequestWaitMs?: number;
}

export interface LogEventEntry {
  event_time_ms: number;
  source_extension_json: string;
}

export interface EventValue {
  gemini_cli_key: EventMetadataKey;
  value: string;
}

export interface LogEvent {
  console_type: 'GEMINI_CLI';
  application: number;
  event_name: string;
  event_metadata: EventValue[][];
  client_email?: string;
  client_install_id?: string;
}

export interface LogRequest {
  log_source_name: 'CONCORD';
  request_time_ms: number;
  log_event: LogEventEntry[][];
}

/**
 * Determine the surface that the user is currently using.  Surface is effectively the
 * distribution channel in which the user is using Gemini CLI.  Gemini CLI comes bundled
 * w/ Firebase Studio and Cloud Shell.  Users that manually download themselves will
 * likely be "SURFACE_NOT_SET".
 *
 * This is computed based upon a series of environment variables these distribution
 * methods might have in their runtimes.
 */
function determineSurface(): string {
  if (process.env['SURFACE']) {
    return process.env['SURFACE'];
  } else if (process.env['GITHUB_SHA']) {
    return 'GitHub';
  } else if (process.env['TERM_PROGRAM'] === 'vscode') {
    return detectIdeFromEnv() || DetectedIde.VSCode;
  } else {
    return 'SURFACE_NOT_SET';
  }
}

/**
 * Clearcut URL to send logging events to.
 */
const CLEARCUT_URL = 'https://play.googleapis.com/log?format=json&hasfast=true';

/**
 * Interval in which buffered events are sent to clearcut.
 */
const FLUSH_INTERVAL_MS = 1000 * 60;

/**
 * Maximum amount of events to keep in memory. Events added after this amount
 * are dropped until the next flush to clearcut, which happens periodically as
 * defined by {@link FLUSH_INTERVAL_MS}.
 */
const MAX_EVENTS = 1000;

/**
 * Maximum events to retry after a failed clearcut flush
 */
const MAX_RETRY_EVENTS = 100;

// Singleton class for batch posting log events to Clearcut. When a new event comes in, the elapsed time
// is checked and events are flushed to Clearcut if at least a minute has passed since the last flush.
export class ClearcutLogger {
  private static instance: ClearcutLogger;
  private config?: Config;
  private sessionData: EventValue[] = [];
  private promptId: string = '';
  private readonly installationManager: InstallationManager;
  private readonly userAccountManager: UserAccountManager;

  /**
   * Queue of pending events that need to be flushed to the server.  New events
   * are added to this queue and then flushed on demand (via `flushToClearcut`)
   */
  private readonly events: FixedDeque<LogEventEntry[]>;

  /**
   * The last time that the events were successfully flushed to the server.
   */
  private lastFlushTime: number = Date.now();

  /**
   * the value is true when there is a pending flush happening. This prevents
   * concurrent flush operations.
   */
  private flushing: boolean = false;

  /**
   * This value is true when a flush was requested during an ongoing flush.
   */
  private pendingFlush: boolean = false;

  private constructor(config: Config) {
    this.config = config;
    this.events = new FixedDeque<LogEventEntry[]>(Array, MAX_EVENTS);
    this.promptId = config?.getSessionId() ?? '';
    this.installationManager = new InstallationManager();
    this.userAccountManager = new UserAccountManager();
  }

  static getInstance(config?: Config): ClearcutLogger | undefined {
    if (config === undefined || !config?.getUsageStatisticsEnabled())
      return undefined;
    if (!ClearcutLogger.instance) {
      ClearcutLogger.instance = new ClearcutLogger(config);
    }
    return ClearcutLogger.instance;
  }

  /** For testing purposes only. */
  static clearInstance(): void {
    // @ts-expect-error - ClearcutLogger is a singleton, but we need to clear it for tests.
    ClearcutLogger.instance = undefined;
  }

  enqueueLogEvent(event: LogEvent): void {
    try {
      // Manually handle overflow for FixedDeque, which throws when full.
      const wasAtCapacity = this.events.size >= MAX_EVENTS;

      if (wasAtCapacity) {
        this.events.shift(); // Evict oldest element to make space.
      }

      this.events.push([
        {
          event_time_ms: Date.now(),
          source_extension_json: safeJsonStringify(event),
        },
      ]);

      if (wasAtCapacity && this.config?.getDebugMode()) {
        console.debug(
          `ClearcutLogger: Dropped old event to prevent memory leak (queue size: ${this.events.size})`,
        );
      }
    } catch (error) {
      if (this.config?.getDebugMode()) {
        console.error('ClearcutLogger: Failed to enqueue log event.', error);
      }
    }
  }

  createLogEvent(eventName: EventNames, data: EventValue[] = []): LogEvent {
    const email = this.userAccountManager.getCachedGoogleAccount();

    if (eventName !== EventNames.START_SESSION) {
      data.push(...this.sessionData);
    }
    const totalAccounts = this.userAccountManager.getLifetimeGoogleAccounts();

    data = this.addDefaultFields(data, totalAccounts);

    const logEvent: LogEvent = {
      console_type: 'GEMINI_CLI',
      application: 102, // GEMINI_CLI
      event_name: eventName as string,
      event_metadata: [data],
    };

    // Should log either email or install ID, not both. See go/cloudmill-1p-oss-instrumentation#define-sessionable-id
    if (email) {
      logEvent.client_email = email;
    } else {
      logEvent.client_install_id = this.installationManager.getInstallationId();
    }

    return logEvent;
  }

  flushIfNeeded(): void {
    if (Date.now() - this.lastFlushTime < FLUSH_INTERVAL_MS) {
      return;
    }

    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  async flushToClearcut(): Promise<LogResponse> {
    if (this.flushing) {
      if (this.config?.getDebugMode()) {
        console.debug(
          'ClearcutLogger: Flush already in progress, marking pending flush.',
        );
      }
      this.pendingFlush = true;
      return Promise.resolve({});
    }
    this.flushing = true;

    if (this.config?.getDebugMode()) {
      console.log('Flushing log events to Clearcut.');
    }
    const eventsToSend = this.events.toArray() as LogEventEntry[][];
    this.events.clear();

    const request: LogRequest[] = [
      {
        log_source_name: 'CONCORD',
        request_time_ms: Date.now(),
        log_event: eventsToSend,
      },
    ];

    let result: LogResponse = {};

    try {
      const response = await fetch(CLEARCUT_URL, {
        method: 'POST',
        body: safeJsonStringify(request),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responseBody = await response.text();

      if (response.status >= 200 && response.status < 300) {
        this.lastFlushTime = Date.now();
        const nextRequestWaitMs = Number(JSON.parse(responseBody)[0]);
        result = {
          ...result,
          nextRequestWaitMs,
        };
      } else {
        if (this.config?.getDebugMode()) {
          console.error(
            `Error flushing log events: HTTP ${response.status}: ${response.statusText}`,
          );
        }

        // Re-queue failed events for retry
        this.requeueFailedEvents(eventsToSend);
      }
    } catch (e: unknown) {
      if (this.config?.getDebugMode()) {
        console.error('Error flushing log events:', e as Error);
      }

      // Re-queue failed events for retry
      this.requeueFailedEvents(eventsToSend);
    }

    this.flushing = false;

    // If a flush was requested while we were flushing, flush again
    if (this.pendingFlush) {
      this.pendingFlush = false;
      // Fire and forget the pending flush
      this.flushToClearcut().catch((error) => {
        if (this.config?.getDebugMode()) {
          console.debug('Error in pending flush to Clearcut:', error);
        }
      });
    }

    return result;
  }

  logStartSessionEvent(event: StartSessionEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MODEL,
        value: event.model,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_EMBEDDING_MODEL,
        value: event.embedding_model,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_SANDBOX,
        value: event.sandbox_enabled.toString(),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_CORE_TOOLS,
        value: event.core_tools_enabled,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_APPROVAL_MODE,
        value: event.approval_mode,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_API_KEY_ENABLED,
        value: event.api_key_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_DEBUG_MODE_ENABLED,
        value: event.debug_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MCP_SERVERS,
        value: event.mcp_servers,
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_VERTEX_API_ENABLED,
        value: event.vertex_ai_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_TELEMETRY_ENABLED,
        value: event.telemetry_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_TELEMETRY_LOG_USER_PROMPTS_ENABLED,
        value: event.telemetry_log_user_prompts_enabled.toString(),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_MCP_SERVERS_COUNT,
        value: event.mcp_servers_count
          ? event.mcp_servers_count.toString()
          : '',
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_START_SESSION_MCP_TOOLS_COUNT,
        value: event.mcp_tools_count?.toString() ?? '',
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MCP_TOOLS,
        value: event.mcp_tools ? event.mcp_tools : '',
      },
    ];
    this.sessionData = data;

    // Flush start event immediately
    this.enqueueLogEvent(this.createLogEvent(EventNames.START_SESSION, data));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  logNewPromptEvent(event: UserPromptEvent): void {
    this.promptId = event.prompt_id;
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_USER_PROMPT_LENGTH,
        value: JSON.stringify(event.prompt_length),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.NEW_PROMPT, data));
    this.flushIfNeeded();
  }

  logToolCallEvent(event: ToolCallEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_NAME,
        value: JSON.stringify(event.function_name),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_DECISION,
        value: JSON.stringify(event.decision),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_SUCCESS,
        value: JSON.stringify(event.success),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_ERROR_MESSAGE,
        value: JSON.stringify(event.error),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_ERROR_TYPE,
        value: JSON.stringify(event.error_type),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_TYPE,
        value: JSON.stringify(event.tool_type),
      },
    ];

    if (event.metadata) {
      const metadataMapping: { [key: string]: EventMetadataKey } = {
        ai_added_lines: EventMetadataKey.GEMINI_CLI_AI_ADDED_LINES,
        ai_removed_lines: EventMetadataKey.GEMINI_CLI_AI_REMOVED_LINES,
        user_added_lines: EventMetadataKey.GEMINI_CLI_USER_ADDED_LINES,
        user_removed_lines: EventMetadataKey.GEMINI_CLI_USER_REMOVED_LINES,
      };

      for (const [key, gemini_cli_key] of Object.entries(metadataMapping)) {
        if (event.metadata[key] !== undefined) {
          data.push({
            gemini_cli_key,
            value: JSON.stringify(event.metadata[key]),
          });
        }
      }
    }

    const logEvent = this.createLogEvent(EventNames.TOOL_CALL, data);
    this.enqueueLogEvent(logEvent);
    this.flushIfNeeded();
  }

  logFileOperationEvent(event: FileOperationEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_NAME,
        value: JSON.stringify(event.tool_name),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_FILE_OPERATION_TYPE,
        value: JSON.stringify(event.operation),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_FILE_OPERATION_LINES,
        value: JSON.stringify(event.lines),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_FILE_OPERATION_MIMETYPE,
        value: JSON.stringify(event.mimetype),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_FILE_OPERATION_EXTENSION,
        value: JSON.stringify(event.extension),
      },
    ];

    if (event.programming_language) {
      data.push({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROGRAMMING_LANGUAGE,
        value: event.programming_language,
      });
    }

    const logEvent = this.createLogEvent(EventNames.FILE_OPERATION, data);
    this.enqueueLogEvent(logEvent);
    this.flushIfNeeded();
  }

  logApiRequestEvent(event: ApiRequestEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_REQUEST_MODEL,
        value: JSON.stringify(event.model),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.API_REQUEST, data));
    this.flushIfNeeded();
  }

  logApiResponseEvent(event: ApiResponseEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_STATUS_CODE,
        value: JSON.stringify(event.status_code),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_MESSAGE,
        value: JSON.stringify(event.error),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_INPUT_TOKEN_COUNT,
        value: JSON.stringify(event.input_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_OUTPUT_TOKEN_COUNT,
        value: JSON.stringify(event.output_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_CACHED_TOKEN_COUNT,
        value: JSON.stringify(event.cached_content_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_THINKING_TOKEN_COUNT,
        value: JSON.stringify(event.thoughts_token_count),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_API_RESPONSE_TOOL_TOKEN_COUNT,
        value: JSON.stringify(event.tool_token_count),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.API_RESPONSE, data));
    this.flushIfNeeded();
  }

  logApiErrorEvent(event: ApiErrorEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_TYPE,
        value: JSON.stringify(event.error_type),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_STATUS_CODE,
        value: JSON.stringify(event.status_code),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_DURATION_MS,
        value: JSON.stringify(event.duration_ms),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.API_ERROR, data));
    this.flushIfNeeded();
  }

  logChatCompressionEvent(event: ChatCompressionEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_COMPRESSION_TOKENS_BEFORE,
        value: `${event.tokens_before}`,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_COMPRESSION_TOKENS_AFTER,
        value: `${event.tokens_after}`,
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.CHAT_COMPRESSION, data),
    );
  }

  logFlashFallbackEvent(): void {
    this.enqueueLogEvent(this.createLogEvent(EventNames.FLASH_FALLBACK, []));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  logLoopDetectedEvent(event: LoopDetectedEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_LOOP_DETECTED_TYPE,
        value: JSON.stringify(event.loop_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.LOOP_DETECTED, data));
    this.flushIfNeeded();
  }

  logNextSpeakerCheck(event: NextSpeakerCheckEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_RESPONSE_FINISH_REASON,
        value: JSON.stringify(event.finish_reason),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_NEXT_SPEAKER_CHECK_RESULT,
        value: JSON.stringify(event.result),
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.NEXT_SPEAKER_CHECK, data),
    );
    this.flushIfNeeded();
  }

  logSlashCommandEvent(event: SlashCommandEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SLASH_COMMAND_NAME,
        value: JSON.stringify(event.command),
      },
    ];

    if (event.subcommand) {
      data.push({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SLASH_COMMAND_SUBCOMMAND,
        value: JSON.stringify(event.subcommand),
      });
    }

    if (event.status) {
      data.push({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SLASH_COMMAND_STATUS,
        value: JSON.stringify(event.status),
      });
    }

    this.enqueueLogEvent(this.createLogEvent(EventNames.SLASH_COMMAND, data));
    this.flushIfNeeded();
  }

  logMalformedJsonResponseEvent(event: MalformedJsonResponseEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_MALFORMED_JSON_RESPONSE_MODEL,
        value: JSON.stringify(event.model),
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.MALFORMED_JSON_RESPONSE, data),
    );
    this.flushIfNeeded();
  }

  logIdeConnectionEvent(event: IdeConnectionEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_IDE_CONNECTION_TYPE,
        value: JSON.stringify(event.connection_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.IDE_CONNECTION, data));
    this.flushIfNeeded();
  }

  logConversationFinishedEvent(event: ConversationFinishedEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_CONVERSATION_TURN_COUNT,
        value: JSON.stringify(event.turnCount),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_APPROVAL_MODE,
        value: event.approvalMode,
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.CONVERSATION_FINISHED, data),
    );
    this.flushIfNeeded();
  }

  logKittySequenceOverflowEvent(event: KittySequenceOverflowEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_KITTY_SEQUENCE_LENGTH,
        value: event.sequence_length.toString(),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_KITTY_TRUNCATED_SEQUENCE,
        value: event.truncated_sequence,
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.KITTY_SEQUENCE_OVERFLOW, data),
    );
    this.flushIfNeeded();
  }

  logEndSessionEvent(): void {
    // Flush immediately on session end.
    this.enqueueLogEvent(this.createLogEvent(EventNames.END_SESSION, []));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  logInvalidChunkEvent(event: InvalidChunkEvent): void {
    const data: EventValue[] = [];

    if (event.error_message) {
      data.push({
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_INVALID_CHUNK_ERROR_MESSAGE,
        value: event.error_message,
      });
    }

    this.enqueueLogEvent(this.createLogEvent(EventNames.INVALID_CHUNK, data));
    this.flushIfNeeded();
  }

  logContentRetryEvent(event: ContentRetryEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_ATTEMPT_NUMBER,
        value: String(event.attempt_number),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_ERROR_TYPE,
        value: event.error_type,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_DELAY_MS,
        value: String(event.retry_delay_ms),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(EventNames.CONTENT_RETRY, data));
    this.flushIfNeeded();
  }

  logContentRetryFailureEvent(event: ContentRetryFailureEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_FAILURE_TOTAL_ATTEMPTS,
        value: String(event.total_attempts),
      },
      {
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_FAILURE_FINAL_ERROR_TYPE,
        value: event.final_error_type,
      },
    ];

    if (event.total_duration_ms) {
      data.push({
        gemini_cli_key:
          EventMetadataKey.GEMINI_CLI_CONTENT_RETRY_FAILURE_TOTAL_DURATION_MS,
        value: String(event.total_duration_ms),
      });
    }

    this.enqueueLogEvent(
      this.createLogEvent(EventNames.CONTENT_RETRY_FAILURE, data),
    );
    this.flushIfNeeded();
  }

  /**
   * Adds default fields to data, and returns a new data array.  This fields
   * should exist on all log events.
   */
  addDefaultFields(data: EventValue[], totalAccounts: number): EventValue[] {
    const surface = determineSurface();

    const defaultLogMetadata: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(
          this.config?.getContentGeneratorConfig()?.authType,
        ),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
        value: `${totalAccounts}`,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
        value: surface,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_VERSION,
        value: CLI_VERSION,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_GIT_COMMIT_HASH,
        value: GIT_COMMIT_INFO,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: this.promptId,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_OS,
        value: process.platform,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_NODE_VERSION,
        value: process.versions.node,
      },
    ];
    return [...data, ...defaultLogMetadata];
  }

  getProxyAgent() {
    const proxyUrl = this.config?.getProxy();
    if (!proxyUrl) return undefined;
    // undici which is widely used in the repo can only support http & https proxy protocol,
    // https://github.com/nodejs/undici/issues/2224
    if (proxyUrl.startsWith('http')) {
      return new HttpsProxyAgent(proxyUrl);
    } else {
      throw new Error('Unsupported proxy type');
    }
  }

  shutdown() {
    this.logEndSessionEvent();
  }

  private requeueFailedEvents(eventsToSend: LogEventEntry[][]): void {
    // Add the events back to the front of the queue to be retried, but limit retry queue size
    const eventsToRetry = eventsToSend.slice(-MAX_RETRY_EVENTS); // Keep only the most recent events

    // Log a warning if we're dropping events
    if (eventsToSend.length > MAX_RETRY_EVENTS && this.config?.getDebugMode()) {
      console.warn(
        `ClearcutLogger: Dropping ${
          eventsToSend.length - MAX_RETRY_EVENTS
        } events due to retry queue limit. Total events: ${
          eventsToSend.length
        }, keeping: ${MAX_RETRY_EVENTS}`,
      );
    }

    // Determine how many events can be re-queued
    const availableSpace = MAX_EVENTS - this.events.size;
    const numEventsToRequeue = Math.min(eventsToRetry.length, availableSpace);

    if (numEventsToRequeue === 0) {
      if (this.config?.getDebugMode()) {
        console.debug(
          `ClearcutLogger: No events re-queued (queue size: ${this.events.size})`,
        );
      }
      return;
    }

    // Get the most recent events to re-queue
    const eventsToRequeue = eventsToRetry.slice(
      eventsToRetry.length - numEventsToRequeue,
    );

    // Prepend events to the front of the deque to be retried first.
    // We iterate backwards to maintain the original order of the failed events.
    for (let i = eventsToRequeue.length - 1; i >= 0; i--) {
      this.events.unshift(eventsToRequeue[i]);
    }
    // Clear any potential overflow
    while (this.events.size > MAX_EVENTS) {
      this.events.pop();
    }

    if (this.config?.getDebugMode()) {
      console.debug(
        `ClearcutLogger: Re-queued ${numEventsToRequeue} events for retry (queue size: ${this.events.size})`,
      );
    }
  }
}

export const TEST_ONLY = {
  MAX_RETRY_EVENTS,
  MAX_EVENTS,
};
