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
import { HttpError, retryWithBackoff } from '../../utils/retry.js';
import { getInstallationId } from '../../utils/user_id.js';

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

// Singleton class for batch posting log events to Clearcut. When a new event comes in, the elapsed time
// is checked and events are flushed to Clearcut if at least a minute has passed since the last flush.
export class ClearcutLogger {
  private static instance: ClearcutLogger;
  private config?: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clearcut expects this format.
  private readonly events: any = [];
  private last_flush_time: number = Date.now();
  private flush_interval_ms: number = 1000 * 60; // Wait at least a minute before flushing events.

  private constructor(config?: Config) {
    this.config = config;
  }

  static getInstance(config?: Config): ClearcutLogger | undefined {
    if (config === undefined || !config?.getUsageStatisticsEnabled())
      return undefined;
    if (!ClearcutLogger.instance) {
      ClearcutLogger.instance = new ClearcutLogger(config);
    }
    return ClearcutLogger.instance;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clearcut expects this format.
  enqueueLogEvent(event: any): void {
    this.events.push([
      {
        event_time_ms: Date.now(),
        source_extension_json: safeJsonStringify(event),
      },
    ]);
  }

  createLogEvent(name: string, data: object[]): object {
    const email = getCachedGoogleAccount();
    const totalAccounts = getLifetimeGoogleAccounts();
    data.push({
      gemini_cli_key: EventMetadataKey.GEMINI_CLI_GOOGLE_ACCOUNTS_COUNT,
      value: totalAccounts.toString(),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logEvent: any = {
      console_type: 'GEMINI_CLI',
      application: 102,
      event_name: name,
      event_metadata: [data] as object[],
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
    if (this.config?.getDebugMode()) {
      console.log('Flushing log events to Clearcut.');
    }
    const eventsToSend = [...this.events];
    if (eventsToSend.length === 0) {
      return {};
    }

    const flushFn = () =>
      new Promise<Buffer>((resolve, reject) => {
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
        };
        const bufs: Buffer[] = [];
        const req = https.request(
          {
            ...options,
            agent: this.getProxyAgent(),
          },
          (res) => {
            if (
              res.statusCode &&
              (res.statusCode < 200 || res.statusCode >= 300)
            ) {
              const err: HttpError = new Error(
                `Request failed with status ${res.statusCode}`,
              );
              err.status = res.statusCode;
              res.resume();
              return reject(err);
            }
            res.on('data', (buf) => bufs.push(buf));
            res.on('end', () => resolve(Buffer.concat(bufs)));
          },
        );
        req.on('error', reject);
        req.end(body);
      });

    try {
      const responseBuffer = await retryWithBackoff(flushFn, {
        maxAttempts: 3,
        initialDelayMs: 200,
        shouldRetry: (err: unknown) => {
          if (!(err instanceof Error)) return false;
          const status = (err as HttpError).status as number | undefined;
          // If status is not available, it's likely a network error
          if (status === undefined) return true;

          // Retry on 429 (Too many Requests) and 5xx server errors.
          return status === 429 || (status >= 500 && status < 600);
        },
      });

      this.events.splice(0, eventsToSend.length);
      this.last_flush_time = Date.now();
      return this.decodeLogResponse(responseBuffer) || {};
    } catch (error) {
      if (this.config?.getDebugMode()) {
        console.error('Clearcut flush failed after multiple retries.', error);
      }
      return {};
    }
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
    const surface =
      process.env.CLOUD_SHELL === 'true'
        ? 'CLOUD_SHELL'
        : process.env.SURFACE || 'SURFACE_NOT_SET';

    const data = [
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
    const data = [
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
    const data = [
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

    const logEvent = this.createLogEvent(tool_call_event_name, data);
    this.enqueueLogEvent(logEvent);
    this.flushIfNeeded();
  }

  logApiRequestEvent(event: ApiRequestEvent): void {
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
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
    const data = [
      {
        gemini_cli_key: EventMetadataKey.GEMINI_CLI_IDE_CONNECTION_TYPE,
        value: JSON.stringify(event.connection_type),
      },
    ];

    this.enqueueLogEvent(this.createLogEvent(ide_connection_event_name, data));
    this.flushIfNeeded();
  }

  logEndSessionEvent(event: EndSessionEvent): void {
    const data = [
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
}
