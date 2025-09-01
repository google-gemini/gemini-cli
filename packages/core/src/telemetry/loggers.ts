/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogRecord, LogAttributes } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Config } from '../config/config.js';
import {
  EVENT_API_ERROR,
  EVENT_API_REQUEST,
  EVENT_API_RESPONSE,
  EVENT_CLI_CONFIG,
  EVENT_IDE_CONNECTION,
  EVENT_TOOL_CALL,
  EVENT_USER_PROMPT,
  EVENT_FLASH_FALLBACK,
  EVENT_NEXT_SPEAKER_CHECK,
  SERVICE_NAME,
  EVENT_SLASH_COMMAND,
  EVENT_CONVERSATION_FINISHED,
  EVENT_CHAT_COMPRESSION,
  EVENT_MALFORMED_JSON_RESPONSE,
  EVENT_INVALID_CHUNK,
  EVENT_CONTENT_RETRY,
  EVENT_CONTENT_RETRY_FAILURE,
} from './constants.js';
import type {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  FileOperationEvent,
  IdeConnectionEvent,
  StartSessionEvent,
  ToolCallEvent,
  UserPromptEvent,
  FlashFallbackEvent,
  NextSpeakerCheckEvent,
  LoopDetectedEvent,
  SlashCommandEvent,
  ConversationFinishedEvent,
  KittySequenceOverflowEvent,
  ChatCompressionEvent,
  MalformedJsonResponseEvent,
  InvalidChunkEvent,
  ContentRetryEvent,
  ContentRetryFailureEvent,
} from './types.js';
import {
  recordApiErrorMetrics,
  recordTokenUsageMetrics,
  recordApiResponseMetrics,
  recordToolCallMetrics,
  recordChatCompressionMetrics,
  recordFileOperationMetric,
  recordInvalidChunk,
  recordContentRetry,
  recordContentRetryFailure,
} from './metrics.js';
import { isTelemetrySdkInitialized } from './sdk.js';
import type { UiEvent } from './uiTelemetry.js';
import { uiTelemetryService } from './uiTelemetry.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import { UserAccountManager } from '../utils/userAccountManager.js';

const shouldLogUserPrompts = (config: Config): boolean =>
  config.getTelemetryLogPromptsEnabled();

function getCommonAttributes(config: Config): LogAttributes {
  const userAccountManager = new UserAccountManager();
  const email = userAccountManager.getCachedGoogleAccount();
  return {
    'session.id': config.getSessionId(),
    ...(email && { 'user.email': email }),
  };
}

export function logCliConfiguration(
  config: Config,
  event: StartSessionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logStartSessionEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    'event.name': EVENT_CLI_CONFIG,
    'event.timestamp': new Date().toISOString(),
    model: event.model,
    embedding_model: event.embedding_model,
    sandbox_enabled: event.sandbox_enabled,
    core_tools_enabled: event.core_tools_enabled,
    approval_mode: event.approval_mode,
    api_key_enabled: event.api_key_enabled,
    vertex_ai_enabled: event.vertex_ai_enabled,
    log_user_prompts_enabled: event.telemetry_log_user_prompts_enabled,
    file_filtering_respect_git_ignore: event.file_filtering_respect_git_ignore,
    debug_mode: event.debug_enabled,
    mcp_servers: event.mcp_servers,
    mcp_servers_count: event.mcp_servers_count,
    mcp_tools: event.mcp_tools,
    mcp_tools_count: event.mcp_tools_count,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: 'CLI configuration loaded.',
    attributes,
  };
  logger.emit(logRecord);
}

export function logUserPrompt(config: Config, event: UserPromptEvent): void {
  ClearcutLogger.getInstance(config)?.logNewPromptEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    'event.name': EVENT_USER_PROMPT,
    'event.timestamp': new Date().toISOString(),
    prompt_length: event.prompt_length,
    prompt_id: event.prompt_id,
  };

  if (event.auth_type) {
    attributes['auth_type'] = event.auth_type;
  }

  if (shouldLogUserPrompts(config)) {
    attributes['prompt'] = event.prompt;
  }

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `User prompt. Length: ${event.prompt_length}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logToolCall(config: Config, event: ToolCallEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_TOOL_CALL,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  ClearcutLogger.getInstance(config)?.logToolCallEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_TOOL_CALL,
    'event.timestamp': new Date().toISOString(),
    function_args: safeJsonStringify(event.function_args, 2),
  };
  if (event.error) {
    attributes['error.message'] = event.error;
    if (event.error_type) {
      attributes['error.type'] = event.error_type;
    }
  }

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Tool call: ${event.function_name}${event.decision ? `. Decision: ${event.decision}` : ''}. Success: ${event.success}. Duration: ${event.duration_ms}ms.`,
    attributes,
  };
  logger.emit(logRecord);
  recordToolCallMetrics(
    config,
    event.function_name,
    event.duration_ms,
    event.success,
    event.decision,
    event.tool_type,
  );
}

export function logFileOperation(
  config: Config,
  event: FileOperationEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFileOperationEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  recordFileOperationMetric(
    config,
    event.operation,
    event.lines,
    event.mimetype,
    event.extension,
    event.programming_language,
  );
}

export function logApiRequest(config: Config, event: ApiRequestEvent): void {
  ClearcutLogger.getInstance(config)?.logApiRequestEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_API_REQUEST,
    'event.timestamp': new Date().toISOString(),
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `API request to ${event.model}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logFlashFallback(
  config: Config,
  event: FlashFallbackEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFlashFallbackEvent();
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_FLASH_FALLBACK,
    'event.timestamp': new Date().toISOString(),
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Switching to flash as Fallback.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logApiError(config: Config, event: ApiErrorEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_ERROR,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  ClearcutLogger.getInstance(config)?.logApiErrorEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_API_ERROR,
    'event.timestamp': new Date().toISOString(),
    ['error.message']: event.error,
    model_name: event.model,
    duration: event.duration_ms,
  };

  if (event.error_type) {
    attributes['error.type'] = event.error_type;
  }
  if (typeof event.status_code === 'number') {
    attributes[SemanticAttributes.HTTP_STATUS_CODE] = event.status_code;
  }

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `API error for ${event.model}. Error: ${event.error}. Duration: ${event.duration_ms}ms.`,
    attributes,
  };
  logger.emit(logRecord);
  recordApiErrorMetrics(
    config,
    event.model,
    event.duration_ms,
    event.status_code,
    event.error_type,
  );
}

export function logApiResponse(config: Config, event: ApiResponseEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_RESPONSE,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  ClearcutLogger.getInstance(config)?.logApiResponseEvent(event);
  if (!isTelemetrySdkInitialized()) return;
  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_API_RESPONSE,
    'event.timestamp': new Date().toISOString(),
  };
  if (event.response_text) {
    attributes['response_text'] = event.response_text;
  }
  if (event.error) {
    attributes['error.message'] = event.error;
  } else if (event.status_code) {
    if (typeof event.status_code === 'number') {
      attributes[SemanticAttributes.HTTP_STATUS_CODE] = event.status_code;
    }
  }

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `API response from ${event.model}. Status: ${event.status_code || 'N/A'}. Duration: ${event.duration_ms}ms.`,
    attributes,
  };
  logger.emit(logRecord);
  recordApiResponseMetrics(
    config,
    event.model,
    event.duration_ms,
    event.status_code,
    event.error,
  );
  recordTokenUsageMetrics(
    config,
    event.model,
    event.input_token_count,
    'input',
  );
  recordTokenUsageMetrics(
    config,
    event.model,
    event.output_token_count,
    'output',
  );
  recordTokenUsageMetrics(
    config,
    event.model,
    event.cached_content_token_count,
    'cache',
  );
  recordTokenUsageMetrics(
    config,
    event.model,
    event.thoughts_token_count,
    'thought',
  );
  recordTokenUsageMetrics(config, event.model, event.tool_token_count, 'tool');
}

export function logLoopDetected(
  config: Config,
  event: LoopDetectedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLoopDetectedEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Loop detected. Type: ${event.loop_type}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logNextSpeakerCheck(
  config: Config,
  event: NextSpeakerCheckEvent,
): void {
  ClearcutLogger.getInstance(config)?.logNextSpeakerCheck(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_NEXT_SPEAKER_CHECK,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Next speaker check.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logSlashCommand(
  config: Config,
  event: SlashCommandEvent,
): void {
  ClearcutLogger.getInstance(config)?.logSlashCommandEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_SLASH_COMMAND,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Slash command: ${event.command}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logIdeConnection(
  config: Config,
  event: IdeConnectionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logIdeConnectionEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_IDE_CONNECTION,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Ide connection. Type: ${event.connection_type}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logConversationFinishedEvent(
  config: Config,
  event: ConversationFinishedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logConversationFinishedEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_CONVERSATION_FINISHED,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Conversation finished.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logChatCompression(
  config: Config,
  event: ChatCompressionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logChatCompressionEvent(event);

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_CHAT_COMPRESSION,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Chat compression (Saved ${event.tokens_before - event.tokens_after} tokens)`,
    attributes,
  };
  logger.emit(logRecord);

  recordChatCompressionMetrics(config, {
    tokens_before: event.tokens_before,
    tokens_after: event.tokens_after,
  });
}

export function logKittySequenceOverflow(
  config: Config,
  event: KittySequenceOverflowEvent,
): void {
  ClearcutLogger.getInstance(config)?.logKittySequenceOverflowEvent(event);
  if (!isTelemetrySdkInitialized()) return;
  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
  };
  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Kitty sequence buffer overflow: ${event.sequence_length} bytes`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logMalformedJsonResponse(
  config: Config,
  event: MalformedJsonResponseEvent,
): void {
  ClearcutLogger.getInstance(config)?.logMalformedJsonResponseEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_MALFORMED_JSON_RESPONSE,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Malformed JSON response from ${event.model}.`,
    attributes,
  };
  logger.emit(logRecord);
}

export function logInvalidChunk(
  config: Config,
  event: InvalidChunkEvent,
): void {
  ClearcutLogger.getInstance(config)?.logInvalidChunkEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    'event.name': EVENT_INVALID_CHUNK,
    'event.timestamp': event['event.timestamp'],
  };

  if (event.error_message) {
    attributes['error.message'] = event.error_message;
  }

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Invalid chunk received from stream.`,
    attributes,
  };
  logger.emit(logRecord);
  recordInvalidChunk(config);
}

export function logContentRetry(
  config: Config,
  event: ContentRetryEvent,
): void {
  ClearcutLogger.getInstance(config)?.logContentRetryEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_CONTENT_RETRY,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `Content retry attempt ${event.attempt_number} due to ${event.error_type}.`,
    attributes,
  };
  logger.emit(logRecord);
  recordContentRetry(config);
}

export function logContentRetryFailure(
  config: Config,
  event: ContentRetryFailureEvent,
): void {
  ClearcutLogger.getInstance(config)?.logContentRetryFailureEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const attributes: LogAttributes = {
    ...getCommonAttributes(config),
    ...event,
    'event.name': EVENT_CONTENT_RETRY_FAILURE,
  };

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: `All content retries failed after ${event.total_attempts} attempts.`,
    attributes,
  };
  logger.emit(logRecord);
  recordContentRetryFailure(config);
}
