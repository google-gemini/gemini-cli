/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogRecord } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import { SERVICE_NAME } from './constants.js';
import {
  EVENT_API_ERROR,
  EVENT_API_RESPONSE,
  EVENT_TOOL_CALL,
} from './types.js';
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
  LoopDetectionDisabledEvent,
  SlashCommandEvent,
  ConversationFinishedEvent,
  KittySequenceOverflowEvent,
  ChatCompressionEvent,
  MalformedJsonResponseEvent,
  InvalidChunkEvent,
  ContentRetryEvent,
  ContentRetryFailureEvent,
  RipgrepFallbackEvent,
  ToolOutputTruncatedEvent,
  ModelRoutingEvent,
  ExtensionDisableEvent,
  ExtensionEnableEvent,
  ExtensionUninstallEvent,
  ExtensionInstallEvent,
  ModelSlashCommandEvent,
  SmartEditStrategyEvent,
  SmartEditCorrectionEvent,
  AgentStartEvent,
  AgentFinishEvent,
  WebFetchFallbackAttemptEvent,
  ExtensionUpdateEvent,
} from './types.js';
import {
  recordApiErrorMetrics,
  recordToolCallMetrics,
  recordChatCompressionMetrics,
  recordFileOperationMetric,
  recordInvalidChunk,
  recordContentRetry,
  recordContentRetryFailure,
  recordModelRoutingMetrics,
  recordModelSlashCommand,
  getConventionAttributes,
  recordTokenUsageMetrics,
  recordApiResponseMetrics,
  recordAgentRunMetrics,
} from './metrics.js';
import { isTelemetrySdkInitialized } from './sdk.js';
import type { UiEvent } from './uiTelemetry.js';
import { uiTelemetryService } from './uiTelemetry.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';

export function logCliConfiguration(
  config: Config,
  event: StartSessionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logStartSessionEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logUserPrompt(config: Config, event: UserPromptEvent): void {
  ClearcutLogger.getInstance(config)?.logNewPromptEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
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

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
  recordToolCallMetrics(config, event.duration_ms, {
    function_name: event.function_name,
    success: event.success,
    decision: event.decision,
    tool_type: event.tool_type,
    ...(event.metadata
      ? {
          model_added_lines: event.metadata['model_added_lines'],
          model_removed_lines: event.metadata['model_removed_lines'],
          user_added_lines: event.metadata['user_added_lines'],
          user_removed_lines: event.metadata['user_removed_lines'],
        }
      : {}),
  });
}

export function logToolOutputTruncated(
  config: Config,
  event: ToolOutputTruncatedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logToolOutputTruncatedEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logFileOperation(
  config: Config,
  event: FileOperationEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFileOperationEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);

  recordFileOperationMetric(config, {
    operation: event.operation,
    lines: event.lines,
    mimetype: event.mimetype,
    extension: event.extension,
    programming_language: event.programming_language,
  });
}

export function logApiRequest(config: Config, event: ApiRequestEvent): void {
  ClearcutLogger.getInstance(config)?.logApiRequestEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logFlashFallback(
  config: Config,
  event: FlashFallbackEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFlashFallbackEvent();
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logRipgrepFallback(
  config: Config,
  event: RipgrepFallbackEvent,
): void {
  ClearcutLogger.getInstance(config)?.logRipgrepFallbackEvent();
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
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

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
  recordApiErrorMetrics(config, event.duration_ms, {
    model: event.model,
    status_code: event.status_code,
    error_type: event.error_type,
  });

  // Record GenAI operation duration for errors
  const conventionAttributes = getConventionAttributes(event);
  recordApiResponseMetrics(config, event.duration_ms, {
    model: event.model,
    status_code: event.status_code,
    genAiAttributes: {
      ...conventionAttributes,
      'error.type': event.error_type || 'unknown',
    },
  });
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

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);

  const conventionAttributes = getConventionAttributes(event);

  recordApiResponseMetrics(config, event.duration_ms, {
    model: event.model,
    status_code: event.status_code,
    genAiAttributes: conventionAttributes,
  });

  const tokenUsageData = [
    { count: event.input_token_count, type: 'input' as const },
    { count: event.output_token_count, type: 'output' as const },
    { count: event.cached_content_token_count, type: 'cache' as const },
    { count: event.thoughts_token_count, type: 'thought' as const },
    { count: event.tool_token_count, type: 'tool' as const },
  ];

  for (const { count, type } of tokenUsageData) {
    recordTokenUsageMetrics(config, count, {
      model: event.model,
      type,
      genAiAttributes: conventionAttributes,
    });
  }
}

export function logLoopDetected(
  config: Config,
  event: LoopDetectedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLoopDetectedEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logLoopDetectionDisabled(
  config: Config,
  event: LoopDetectionDisabledEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLoopDetectionDisabledEvent();
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logNextSpeakerCheck(
  config: Config,
  event: NextSpeakerCheckEvent,
): void {
  ClearcutLogger.getInstance(config)?.logNextSpeakerCheck(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logSlashCommand(
  config: Config,
  event: SlashCommandEvent,
): void {
  ClearcutLogger.getInstance(config)?.logSlashCommandEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logIdeConnection(
  config: Config,
  event: IdeConnectionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logIdeConnectionEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logConversationFinishedEvent(
  config: Config,
  event: ConversationFinishedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logConversationFinishedEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logChatCompression(
  config: Config,
  event: ChatCompressionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logChatCompressionEvent(event);

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
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
  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logMalformedJsonResponse(
  config: Config,
  event: MalformedJsonResponseEvent,
): void {
  ClearcutLogger.getInstance(config)?.logMalformedJsonResponseEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logInvalidChunk(
  config: Config,
  event: InvalidChunkEvent,
): void {
  ClearcutLogger.getInstance(config)?.logInvalidChunkEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
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

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
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

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
  recordContentRetryFailure(config);
}

export function logModelRouting(
  config: Config,
  event: ModelRoutingEvent,
): void {
  ClearcutLogger.getInstance(config)?.logModelRoutingEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
  recordModelRoutingMetrics(config, event);
}

export function logModelSlashCommand(
  config: Config,
  event: ModelSlashCommandEvent,
): void {
  ClearcutLogger.getInstance(config)?.logModelSlashCommandEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
  recordModelSlashCommand(config, event);
}

export function logExtensionInstallEvent(
  config: Config,
  event: ExtensionInstallEvent,
): void {
  ClearcutLogger.getInstance(config)?.logExtensionInstallEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logExtensionUninstall(
  config: Config,
  event: ExtensionUninstallEvent,
): void {
  ClearcutLogger.getInstance(config)?.logExtensionUninstallEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logExtensionUpdateEvent(
  config: Config,
  event: ExtensionUpdateEvent,
): void {
  ClearcutLogger.getInstance(config)?.logExtensionUpdateEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logExtensionEnable(
  config: Config,
  event: ExtensionEnableEvent,
): void {
  ClearcutLogger.getInstance(config)?.logExtensionEnableEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logExtensionDisable(
  config: Config,
  event: ExtensionDisableEvent,
): void {
  ClearcutLogger.getInstance(config)?.logExtensionDisableEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logSmartEditStrategy(
  config: Config,
  event: SmartEditStrategyEvent,
): void {
  ClearcutLogger.getInstance(config)?.logSmartEditStrategyEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logSmartEditCorrectionEvent(
  config: Config,
  event: SmartEditCorrectionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logSmartEditCorrectionEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logAgentStart(config: Config, event: AgentStartEvent): void {
  ClearcutLogger.getInstance(config)?.logAgentStartEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}

export function logAgentFinish(config: Config, event: AgentFinishEvent): void {
  ClearcutLogger.getInstance(config)?.logAgentFinishEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);

  recordAgentRunMetrics(config, event);
}

export function logWebFetchFallbackAttempt(
  config: Config,
  event: WebFetchFallbackAttemptEvent,
): void {
  ClearcutLogger.getInstance(config)?.logWebFetchFallbackAttemptEvent(event);
  if (!isTelemetrySdkInitialized()) return;

  const logger = logs.getLogger(SERVICE_NAME);
  const logRecord: LogRecord = {
    body: event.toLogBody(),
    attributes: event.toOpenTelemetryAttributes(config),
  };
  logger.emit(logRecord);
}
