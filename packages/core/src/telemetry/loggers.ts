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
  EditStrategyEvent,
  EditCorrectionEvent,
  AgentStartEvent,
  AgentFinishEvent,
  RecoveryAttemptEvent,
  WebFetchFallbackAttemptEvent,
  ExtensionUpdateEvent,
  LlmLoopCheckEvent,
  HookCallEvent,
  StartupStatsEvent,
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
  recordRecoveryAttemptMetrics,
  recordLinesChanged,
  recordHookCallMetrics,
} from './metrics.js';
import { bufferTelemetryEvent } from './sdk.js';
import type { UiEvent } from './uiTelemetry.js';
import { uiTelemetryService } from './uiTelemetry.js';
import { ClearcutLogger } from './clearcut-logger/clearcut-logger.js';

export function logCliConfiguration(
  config: Config,
  event: StartSessionEvent,
): void {
  void ClearcutLogger.getInstance(config)?.logStartSessionEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logUserPrompt(config: Config, event: UserPromptEvent): void {
  ClearcutLogger.getInstance(config)?.logNewPromptEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);

    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logToolCall(config: Config, event: ToolCallEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_TOOL_CALL,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  ClearcutLogger.getInstance(config)?.logToolCallEvent(event);
  bufferTelemetryEvent(() => {
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
    });

    if (event.metadata) {
      const added = event.metadata['model_added_lines'];
      if (typeof added === 'number' && added > 0) {
        recordLinesChanged(config, added, 'added', {
          function_name: event.function_name,
        });
      }
      const removed = event.metadata['model_removed_lines'];
      if (typeof removed === 'number' && removed > 0) {
        recordLinesChanged(config, removed, 'removed', {
          function_name: event.function_name,
        });
      }
    }
  });
}

export function logToolOutputTruncated(
  config: Config,
  event: ToolOutputTruncatedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logToolOutputTruncatedEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logFileOperation(
  config: Config,
  event: FileOperationEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFileOperationEvent(event);
  bufferTelemetryEvent(() => {
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
  });
}

export function logApiRequest(config: Config, event: ApiRequestEvent): void {
  ClearcutLogger.getInstance(config)?.logApiRequestEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    logger.emit(event.toLogRecord(config));
    logger.emit(event.toSemanticLogRecord(config));
  });
}

export function logFlashFallback(
  config: Config,
  event: FlashFallbackEvent,
): void {
  ClearcutLogger.getInstance(config)?.logFlashFallbackEvent();
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logRipgrepFallback(
  config: Config,
  event: RipgrepFallbackEvent,
): void {
  ClearcutLogger.getInstance(config)?.logRipgrepFallbackEvent();
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logApiError(config: Config, event: ApiErrorEvent): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_ERROR,
    'event.timestamp': new Date().toISOString(),
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);
  ClearcutLogger.getInstance(config)?.logApiErrorEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    logger.emit(event.toLogRecord(config));
    logger.emit(event.toSemanticLogRecord(config));

    recordApiErrorMetrics(config, event.duration_ms, {
      model: event.model,
      status_code: event.status_code,
      error_type: event.error_type,
    });

    // Record GenAI operation duration for errors
    recordApiResponseMetrics(config, event.duration_ms, {
      model: event.model,
      status_code: event.status_code,
      genAiAttributes: {
        ...getConventionAttributes(event),
        'error.type': event.error_type || 'unknown',
      },
    });
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
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    logger.emit(event.toLogRecord(config));
    logger.emit(event.toSemanticLogRecord(config));

    const conventionAttributes = getConventionAttributes(event);

    recordApiResponseMetrics(config, event.duration_ms, {
      model: event.model,
      status_code: event.status_code,
      genAiAttributes: conventionAttributes,
    });

    const tokenUsageData = [
      { count: event.usage.input_token_count, type: 'input' as const },
      { count: event.usage.output_token_count, type: 'output' as const },
      { count: event.usage.cached_content_token_count, type: 'cache' as const },
      { count: event.usage.thoughts_token_count, type: 'thought' as const },
      { count: event.usage.tool_token_count, type: 'tool' as const },
    ];

    for (const { count, type } of tokenUsageData) {
      recordTokenUsageMetrics(config, count, {
        model: event.model,
        type,
        genAiAttributes: conventionAttributes,
      });
    }
  });
}

export function logLoopDetected(
  config: Config,
  event: LoopDetectedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLoopDetectedEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logLoopDetectionDisabled(
  config: Config,
  event: LoopDetectionDisabledEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLoopDetectionDisabledEvent();
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logNextSpeakerCheck(
  config: Config,
  event: NextSpeakerCheckEvent,
): void {
  ClearcutLogger.getInstance(config)?.logNextSpeakerCheck(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logSlashCommand(
  config: Config,
  event: SlashCommandEvent,
): void {
  ClearcutLogger.getInstance(config)?.logSlashCommandEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logIdeConnection(
  config: Config,
  event: IdeConnectionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logIdeConnectionEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logConversationFinishedEvent(
  config: Config,
  event: ConversationFinishedEvent,
): void {
  ClearcutLogger.getInstance(config)?.logConversationFinishedEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
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

export function logMalformedJsonResponse(
  config: Config,
  event: MalformedJsonResponseEvent,
): void {
  ClearcutLogger.getInstance(config)?.logMalformedJsonResponseEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logInvalidChunk(
  config: Config,
  event: InvalidChunkEvent,
): void {
  ClearcutLogger.getInstance(config)?.logInvalidChunkEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
    recordInvalidChunk(config);
  });
}

export function logContentRetry(
  config: Config,
  event: ContentRetryEvent,
): void {
  ClearcutLogger.getInstance(config)?.logContentRetryEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
    recordContentRetry(config);
  });
}

export function logContentRetryFailure(
  config: Config,
  event: ContentRetryFailureEvent,
): void {
  ClearcutLogger.getInstance(config)?.logContentRetryFailureEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
    recordContentRetryFailure(config);
  });
}

export function logModelRouting(
  config: Config,
  event: ModelRoutingEvent,
): void {
  ClearcutLogger.getInstance(config)?.logModelRoutingEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
    recordModelRoutingMetrics(config, event);
  });
}

export function logModelSlashCommand(
  config: Config,
  event: ModelSlashCommandEvent,
): void {
  ClearcutLogger.getInstance(config)?.logModelSlashCommandEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
    recordModelSlashCommand(config, event);
  });
}

export async function logExtensionInstallEvent(
  config: Config,
  event: ExtensionInstallEvent,
): Promise<void> {
  await ClearcutLogger.getInstance(config)?.logExtensionInstallEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export async function logExtensionUninstall(
  config: Config,
  event: ExtensionUninstallEvent,
): Promise<void> {
  await ClearcutLogger.getInstance(config)?.logExtensionUninstallEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export async function logExtensionUpdateEvent(
  config: Config,
  event: ExtensionUpdateEvent,
): Promise<void> {
  await ClearcutLogger.getInstance(config)?.logExtensionUpdateEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export async function logExtensionEnable(
  config: Config,
  event: ExtensionEnableEvent,
): Promise<void> {
  await ClearcutLogger.getInstance(config)?.logExtensionEnableEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export async function logExtensionDisable(
  config: Config,
  event: ExtensionDisableEvent,
): Promise<void> {
  await ClearcutLogger.getInstance(config)?.logExtensionDisableEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logEditStrategy(
  config: Config,
  event: EditStrategyEvent,
): void {
  ClearcutLogger.getInstance(config)?.logEditStrategyEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logEditCorrectionEvent(
  config: Config,
  event: EditCorrectionEvent,
): void {
  ClearcutLogger.getInstance(config)?.logEditCorrectionEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logAgentStart(config: Config, event: AgentStartEvent): void {
  ClearcutLogger.getInstance(config)?.logAgentStartEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logAgentFinish(config: Config, event: AgentFinishEvent): void {
  ClearcutLogger.getInstance(config)?.logAgentFinishEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);

    recordAgentRunMetrics(config, event);
  });
}

export function logRecoveryAttempt(
  config: Config,
  event: RecoveryAttemptEvent,
): void {
  ClearcutLogger.getInstance(config)?.logRecoveryAttemptEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);

    recordRecoveryAttemptMetrics(config, event);
  });
}

export function logWebFetchFallbackAttempt(
  config: Config,
  event: WebFetchFallbackAttemptEvent,
): void {
  ClearcutLogger.getInstance(config)?.logWebFetchFallbackAttemptEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logLlmLoopCheck(
  config: Config,
  event: LlmLoopCheckEvent,
): void {
  ClearcutLogger.getInstance(config)?.logLlmLoopCheckEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}

export function logHookCall(config: Config, event: HookCallEvent): void {
  ClearcutLogger.getInstance(config)?.logHookCallEvent(event);
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);

    recordHookCallMetrics(
      config,
      event.hook_event_name,
      event.hook_name,
      event.duration_ms,
      event.success,
    );
  });
}

export function logStartupStats(
  config: Config,
  event: StartupStatsEvent,
): void {
  bufferTelemetryEvent(() => {
    const logger = logs.getLogger(SERVICE_NAME);
    const logRecord: LogRecord = {
      body: event.toLogBody(),
      attributes: event.toOpenTelemetryAttributes(config),
    };
    logger.emit(logRecord);
  });
}
