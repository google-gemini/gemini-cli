/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum TelemetryTarget {
  GCP = 'gcp',
  LOCAL = 'local',
}

const DEFAULT_TELEMETRY_TARGET = TelemetryTarget.LOCAL;
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4317';

export { DEFAULT_TELEMETRY_TARGET, DEFAULT_OTLP_ENDPOINT };
export {
  initializeTelemetry,
  shutdownTelemetry,
  flushTelemetry,
  isTelemetrySdkInitialized,
} from './sdk.js';
export {
  resolveTelemetrySettings,
  parseBooleanEnvFlag,
  parseTelemetryTargetValue,
} from './config.js';
export {
  GcpTraceExporter,
  GcpMetricExporter,
  GcpLogExporter,
} from './gcp-exporters.js';
export {
  logCliConfiguration,
  logUserPrompt,
  logToolCall,
  logApiRequest,
  logApiError,
  logApiResponse,
  logFlashFallback,
  logSlashCommand,
  logConversationFinishedEvent,
  logChatCompression,
  logToolOutputTruncated,
  logExtensionEnable,
  logExtensionInstallEvent,
  logExtensionUninstall,
  logExtensionUpdateEvent,
  logWebFetchFallbackAttempt,
} from './loggers.js';
export type { SlashCommandEvent, ChatCompressionEvent } from './types.js';
export {
  SlashCommandStatus,
  EndSessionEvent,
  UserPromptEvent,
  ApiRequestEvent,
  ApiErrorEvent,
  ApiResponseEvent,
  FlashFallbackEvent,
  StartSessionEvent,
  ToolCallEvent,
  ConversationFinishedEvent,
  ToolOutputTruncatedEvent,
  WebFetchFallbackAttemptEvent,
  ToolCallDecision,
} from './types.js';
export { makeSlashCommandEvent, makeChatCompressionEvent } from './types.js';
export type { TelemetryEvent } from './types.js';
export { SpanStatusCode, ValueType } from '@opentelemetry/api';
export { SemanticAttributes } from '@opentelemetry/semantic-conventions';
export * from './uiTelemetry.js';
export {
  MemoryMonitor,
  initializeMemoryMonitor,
  getMemoryMonitor,
  recordCurrentMemoryUsage,
  startGlobalMemoryMonitoring,
  stopGlobalMemoryMonitoring,
} from './memory-monitor.js';
export type { MemorySnapshot, ProcessMetrics } from './memory-monitor.js';
export { HighWaterMarkTracker } from './high-water-mark-tracker.js';
export { RateLimiter } from './rate-limiter.js';
export { ActivityType } from './activity-types.js';
export {
  ActivityDetector,
  getActivityDetector,
  recordUserActivity,
  isUserActive,
} from './activity-detector.js';
export {
  ActivityMonitor,
  initializeActivityMonitor,
  getActivityMonitor,
  startGlobalActivityMonitoring,
  stopGlobalActivityMonitoring,
} from './activity-monitor.js';
export {
  // Core metrics functions
  recordToolCallMetrics,
  recordTokenUsageMetrics,
  recordApiResponseMetrics,
  recordApiErrorMetrics,
  recordFileOperationMetric,
  recordInvalidChunk,
  recordContentRetry,
  recordContentRetryFailure,
  recordModelRoutingMetrics,
  // Custom metrics for token usage and API responses
  recordCustomTokenUsageMetrics,
  recordCustomApiResponseMetrics,
  recordExitFail,
  // OpenTelemetry GenAI semantic convention for token usage and operation duration
  recordGenAiClientTokenUsage,
  recordGenAiClientOperationDuration,
  getConventionAttributes,
  // Performance monitoring functions
  recordStartupPerformance,
  recordMemoryUsage,
  recordCpuUsage,
  recordToolQueueDepth,
  recordToolExecutionBreakdown,
  recordTokenEfficiency,
  recordApiRequestBreakdown,
  recordPerformanceScore,
  recordPerformanceRegression,
  recordBaselineComparison,
  isPerformanceMonitoringActive,
  recordFlickerFrame,
  recordSlowRender,
  // Performance monitoring types
  PerformanceMetricType,
  MemoryMetricType,
  ToolExecutionPhase,
  ApiRequestPhase,
  FileOperation,
  // OpenTelemetry Semantic Convention types
  GenAiOperationName,
  GenAiProviderName,
  GenAiTokenType,
} from './metrics.js';
export { runInDevTraceSpan, type SpanMetadata } from './trace.js';
export { startupProfiler, StartupProfiler } from './startupProfiler.js';
