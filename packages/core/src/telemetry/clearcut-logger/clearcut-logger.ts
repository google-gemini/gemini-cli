/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'buffer';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

import {
  StartSessionEvent,
  EndSessionEvent,
  UserPromptEvent,
  ToolCallEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
  FlashFallbackEvent,
  LoopDetectedEvent,
  NextSpeakerCheckEvent,
  SlashCommandEvent,
  MalformedJsonResponseEvent,
  IdeConnectionEvent,
} from '../types.js';
import { EventMetadataKey } from './event-metadata-key.js';
import { Config } from '../../config/config.js';
import { safeJsonStringify } from '../../utils/safeJsonStringify.js';
import {
  getCachedGoogleAccount,
  getLifetimeGoogleAccounts,
} from '../../utils/user_account.js';
import { getInstallationId } from '../../utils/user_id.js';
import { FixedDeque } from 'mnemonist';

const start_session_event_name = 'start_session';
const new_prompt_event_name = 'new_prompt';
const tool_call_event_name = 'tool_call';
const api_request_event_name = 'api_request';
const api_response_event_name = 'api_response';
const api_error_event_name = 'api_error';
const end_session_event_name = 'end_session';
const flash_fallback_event_name = 'flash_fallback';
const loop_detected_event_name = 'loop_detected';
const next_speaker_check_event_name = 'next_speaker_check';
const slash_command_event_name = 'slash_command';
const malformed_json_response_event_name = 'malformed_json_response';
const ide_connection_event_name = 'ide_connection';

export interface LogResponse {
  nextRequestWaitMs?: number;
}

export interface LogEventEntry {
  event_time_ms: number;
  source_extension_json: string;
}

export type EventValue = {
  gemini_cli_key: EventMetadataKey | string;
  value: string;
};

export type LogEvent = {
  console_type: string;
  application: number;
  event_name: string;
  event_metadata: EventValue[][];
  client_email?: string;
  client_install_id?: string;
};

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
  if (process.env.CLOUD_SHELL === 'true') {
    return 'CLOUD_SHELL';
  } else if (process.env.MONOSPACE_ENV === 'true') {
    return 'FIREBASE_STUDIO';
  } else {
    return process.env.SURFACE || 'SURFACE_NOT_SET';
  }
}

// Singleton class for batch posting log events to Clearcut. When a new event comes in, the elapsed time
// is checked and events are flushed to Clearcut if at least a minute has passed since the last flush.
export class ClearcutLogger {
  private static instance: ClearcutLogger;
  private config?: Config;
  private readonly events: FixedDeque<LogEventEntry[]>;
  private last_flush_time: number = Date.now();
  private flush_interval_ms: number = 1000 * 60; // Wait at least a minute before flushing events.
  private readonly max_events: number = 1000; // Maximum events to keep in memory
  private readonly max_retry_events: number = 100; // Maximum failed events to retry
  private flushing: boolean = false; // Prevent concurrent flush operations
  private pendingFlush: boolean = false; // Track if a flush was requested during an ongoing flush

  private constructor(config?: Config) {
    this.config = config;
    this.events = new FixedDeque<LogEventEntry[]>(Array, this.max_events);
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

  enqueueLogEvent(event: object): void {
    try {
      // Manually handle overflow for FixedDeque, which throws when full.
      const wasAtCapacity = this.events.size >= this.max_events;

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

  createLogEvent(name: string, data: EventValue[]): LogEvent {
    const email = getCachedGoogleAccount();
    const totalAccounts = getLifetimeGoogleAccounts();
    data.push({
      gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
      value: totalAccounts.toString(),
    });

    const logEvent: LogEvent = {
      console_type: 'GEMINI_CLI',
      application: 102,
      event_name: name,
      event_metadata: [data],
    };

    // Should log either email or install ID, not both. See go/cloudmill-1p-oss-instrumentation#define-sessionable-id
    if (email) {
      logEvent.client_email = email;
    } else {
      logEvent.client_install_id = getInstallationId();
    }

    return logEvent;
  }

  flushIfNeeded(): void {
    if (Date.now() - this.last_flush_time < this.flush_interval_ms) {
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

    return new Promise<{ buffer: Buffer; statusCode?: number }>(
      (resolve, reject) => {
        const request = [
          {
            log_source_name: 'CONCORD',
            request_time_ms: Date.now(),
            log_event: eventsToSend,
          },
        ];
        const body = safeJsonStringify(request);
        const options = {
          hostname: 'play.googleapis.com',
          path: '/log',
          method: 'POST',
          headers: { 'Content-Length': Buffer.byteLength(body) },
          timeout: 30000, // 30-second timeout
        };
        const bufs: Buffer[] = [];
        const req = https.request(
          {
            ...options,
            agent: this.getProxyAgent(),
          },
          (res) => {
            res.on('error', reject); // Handle stream errors
            res.on('data', (buf) => bufs.push(buf));
            res.on('end', () => {
              try {
                const buffer = Buffer.concat(bufs);
                // Check if we got a successful response
                if (
                  res.statusCode &&
                  res.statusCode >= 200 &&
                  res.statusCode < 300
                ) {
                  resolve({ buffer, statusCode: res.statusCode });
                } else {
                  // HTTP error - reject with status code for retry handling
                  reject(
                    new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`),
                  );
                }
              } catch (e) {
                reject(e);
              }
            });
          },
        );
        req.on('error', (e) => {
          // Network-level error
          reject(e);
        });
        req.on('timeout', () => {
          if (!req.destroyed) {
            req.destroy(new Error('Request timeout after 30 seconds'));
          }
        });
        req.end(body);
      },
    )
      .then(({ buffer }) => {
        try {
          this.last_flush_time = Date.now();
          return this.decodeLogResponse(buffer) || {};
        } catch (error: unknown) {
          console.error('Error decoding log response:', error);
          return {};
        }
      })
      .catch((error: unknown) => {
        // Handle both network-level and HTTP-level errors
        if (this.config?.getDebugMode()) {
          console.error('Error flushing log events:', error);
        }

        // Re-queue failed events for retry
        this.requeueFailedEvents(eventsToSend);

        // Return empty response to maintain the Promise<LogResponse> contract
        return {};
      })
      .finally(() => {
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
      });
  }

  // Visible for testing. Decodes protobuf-encoded response from Clearcut server.
  decodeLogResponse(buf: Buffer): LogResponse | undefined {
    // TODO(obrienowen): return specific errors to facilitate debugging.
    if (buf.length < 1) {
      return undefined;
    }

    // The first byte of the buffer is `field<<3 | type`. We're looking for field
    // 1, with type varint, represented by type=0. If the first byte isn't 8, that
    // means field 1 is missing or the message is corrupted. Either way, we return
    // undefined.
    if (buf.readUInt8(0) !== 8) {
      return undefined;
    }

    let ms = BigInt(0);
    let cont = true;

    // In each byte, the most significant bit is the continuation bit. If it's
    // set, we keep going. The lowest 7 bits, are data bits. They are concatenated
    // in reverse order to form the final number.
    for (let i = 1; cont && i < buf.length; i++) {
      const byte = buf.readUInt8(i);
      ms |= BigInt(byte & 0x7f) << BigInt(7 * (i - 1));
      cont = (byte & 0x80) !== 0;
    }

    if (cont) {
      // We have fallen off the buffer without seeing a terminating byte. The
      // message is corrupted.
      return undefined;
    }

    const returnVal = {
      nextRequestWaitMs: Number(ms),
    };
    return returnVal;
  }

  logStartSessionEvent(event: StartSessionEvent): void {
    const surface = determineSurface();

    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_START_SESSION_MODEL,
        value: event.model,
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
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
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SURFACE,
        value: surface,
      },
    ];

    // Flush start event immediately
    this.enqueueLogEvent(this.createLogEvent(start_session_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  logNewPromptEvent(event: UserPromptEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_USER_PROMPT_LENGTH,
        value: JSON.stringify(event.prompt_length),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(new_prompt_event_name, data));
    this.flushIfNeeded();
  }

  logToolCallEvent(event: ToolCallEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_TOOL_CALL_NAME,
        value: JSON.stringify(event.function_name),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
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

    const logEvent = this.createLogEvent(tool_call_event_name, data);
    this.enqueueLogEvent(logEvent);
    this.flushIfNeeded();
  }

  logApiRequestEvent(event: ApiRequestEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_REQUEST_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_request_event_name, data));
    this.flushIfNeeded();
  }

  logApiResponseEvent(event: ApiResponseEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_RESPONSE_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
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
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_response_event_name, data));
    this.flushIfNeeded();
  }

  logApiErrorEvent(event: ApiErrorEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_API_ERROR_MODEL,
        value: JSON.stringify(event.model),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
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
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(api_error_event_name, data));
    this.flushIfNeeded();
  }

  logFlashFallbackEvent(event: FlashFallbackEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_AUTH_TYPE,
        value: JSON.stringify(event.auth_type),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(flash_fallback_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
  }

  logLoopDetectedEvent(event: LoopDetectedEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_LOOP_DETECTED_TYPE,
        value: JSON.stringify(event.loop_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(loop_detected_event_name, data));
    this.flushIfNeeded();
  }

  logNextSpeakerCheck(event: NextSpeakerCheckEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_PROMPT_ID,
        value: JSON.stringify(event.prompt_id),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_RESPONSE_FINISH_REASON,
        value: JSON.stringify(event.finish_reason),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_NEXT_SPEAKER_CHECK_RESULT,
        value: JSON.stringify(event.result),
      },
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: this.config?.getSessionId() ?? '',
      },
    ];

    this.enqueueLogEvent(
      this.createLogEvent(next_speaker_check_event_name, data),
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

    this.enqueueLogEvent(this.createLogEvent(slash_command_event_name, data));
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
      this.createLogEvent(malformed_json_response_event_name, data),
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

    this.enqueueLogEvent(this.createLogEvent(ide_connection_event_name, data));
    this.flushIfNeeded();
  }

  logEndSessionEvent(event: EndSessionEvent): void {
    const data: EventValue[] = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_SESSION_ID,
        value: event?.session_id?.toString() ?? '',
      },
    ];

    // Flush immediately on session end.
    this.enqueueLogEvent(this.createLogEvent(end_session_event_name, data));
    this.flushToClearcut().catch((error) => {
      console.debug('Error flushing to Clearcut:', error);
    });
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
    const event = new EndSessionEvent(this.config);
    this.logEndSessionEvent(event);
  }

  private requeueFailedEvents(eventsToSend: LogEventEntry[][]): void {
    // Add the events back to the front of the queue to be retried, but limit retry queue size
    const eventsToRetry = eventsToSend.slice(-this.max_retry_events); // Keep only the most recent events

    // Log a warning if we're dropping events
    if (
      eventsToSend.length > this.max_retry_events &&
      this.config?.getDebugMode()
    ) {
      console.warn(
        `ClearcutLogger: Dropping ${
          eventsToSend.length - this.max_retry_events
        } events due to retry queue limit. Total events: ${
          eventsToSend.length
        }, keeping: ${this.max_retry_events}`,
      );
    }

    // Determine how many events can be re-queued
    const availableSpace = this.max_events - this.events.size;
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
    while (this.events.size > this.max_events) {
      this.events.pop();
    }

    if (this.config?.getDebugMode()) {
      console.debug(
        `ClearcutLogger: Re-queued ${numEventsToRequeue} events for retry (queue size: ${this.events.size})`,
      );
    }
  }
}
