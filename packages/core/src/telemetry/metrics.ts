/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, Meter, Counter, Histogram } from '@opentelemetry/api';
import { diag, metrics, ValueType } from '@opentelemetry/api';
import { SERVICE_NAME, EVENT_CHAT_COMPRESSION } from './constants.js';
import type { Config } from '../config/config.js';
import type { ModelRoutingEvent, ModelSlashCommandEvent } from './types.js';
import { AuthType } from '../core/contentGenerator.js';

const TOOL_CALL_COUNT = 'gemini_cli.tool.call.count';
const TOOL_CALL_LATENCY = 'gemini_cli.tool.call.latency';
const API_REQUEST_COUNT = 'gemini_cli.api.request.count';
const API_REQUEST_LATENCY = 'gemini_cli.api.request.latency';
const TOKEN_USAGE = 'gemini_cli.token.usage';
const SESSION_COUNT = 'gemini_cli.session.count';
const FILE_OPERATION_COUNT = 'gemini_cli.file.operation.count';
const INVALID_CHUNK_COUNT = 'gemini_cli.chat.invalid_chunk.count';
const CONTENT_RETRY_COUNT = 'gemini_cli.chat.content_retry.count';
const CONTENT_RETRY_FAILURE_COUNT =
  'gemini_cli.chat.content_retry_failure.count';
const MODEL_ROUTING_LATENCY = 'gemini_cli.model_routing.latency';
const MODEL_ROUTING_FAILURE_COUNT = 'gemini_cli.model_routing.failure.count';
const MODEL_SLASH_COMMAND_CALL_COUNT =
  'gemini_cli.slash_command.model.call_count';

// OpenTelemetry GenAI Semantic Convention Metrics
const GEN_AI_CLIENT_TOKEN_USAGE = 'gen_ai.client.token.usage';
const GEN_AI_CLIENT_OPERATION_DURATION = 'gen_ai.client.operation.duration';

// Performance Monitoring Metrics
const STARTUP_TIME = 'gemini_cli.startup.duration';
const MEMORY_USAGE = 'gemini_cli.memory.usage';
const CPU_USAGE = 'gemini_cli.cpu.usage';
const TOOL_QUEUE_DEPTH = 'gemini_cli.tool.queue.depth';
const TOOL_EXECUTION_BREAKDOWN = 'gemini_cli.tool.execution.breakdown';
const TOKEN_EFFICIENCY = 'gemini_cli.token.efficiency';
const API_REQUEST_BREAKDOWN = 'gemini_cli.api.request.breakdown';
const PERFORMANCE_SCORE = 'gemini_cli.performance.score';
const REGRESSION_DETECTION = 'gemini_cli.performance.regression';
const REGRESSION_PERCENTAGE_CHANGE =
  'gemini_cli.performance.regression.percentage_change';
const BASELINE_COMPARISON = 'gemini_cli.performance.baseline.comparison';

const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};

const COUNTER_DEFINITIONS = {
  [TOOL_CALL_COUNT]: {
    description: 'Counts tool calls, tagged by function name and success.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (toolCallCounter = c),
    attributes: {} as {
      function_name: string;
      success: boolean;
      decision?: 'accept' | 'reject' | 'modify' | 'auto_accept';
      tool_type?: 'native' | 'mcp';
    },
  },
  [API_REQUEST_COUNT]: {
    description: 'Counts API requests, tagged by model and status.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (apiRequestCounter = c),
    attributes: {} as {
      model: string;
      status_code?: number | string;
      error_type?: string;
    },
  },
  [TOKEN_USAGE]: {
    description: 'Counts the total number of tokens used.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (tokenUsageCounter = c),
    attributes: {} as {
      model: string;
      type: 'input' | 'output' | 'thought' | 'cache' | 'tool';
    },
  },
  [SESSION_COUNT]: {
    description: 'Count of CLI sessions started.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (sessionCounter = c),
    attributes: {} as Record<string, never>,
  },
  [FILE_OPERATION_COUNT]: {
    description: 'Counts file operations (create, read, update).',
    valueType: ValueType.INT,
    assign: (c: Counter) => (fileOperationCounter = c),
    attributes: {} as {
      operation: FileOperation;
      lines?: number;
      mimetype?: string;
      extension?: string;
      programming_language?: string;
    },
  },
  [INVALID_CHUNK_COUNT]: {
    description: 'Counts invalid chunks received from a stream.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (invalidChunkCounter = c),
    attributes: {} as Record<string, never>,
  },
  [CONTENT_RETRY_COUNT]: {
    description: 'Counts retries due to content errors (e.g., empty stream).',
    valueType: ValueType.INT,
    assign: (c: Counter) => (contentRetryCounter = c),
    attributes: {} as Record<string, never>,
  },
  [CONTENT_RETRY_FAILURE_COUNT]: {
    description: 'Counts occurrences of all content retries failing.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (contentRetryFailureCounter = c),
    attributes: {} as Record<string, never>,
  },
  [MODEL_ROUTING_FAILURE_COUNT]: {
    description: 'Counts model routing failures.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (modelRoutingFailureCounter = c),
    attributes: {} as {
      'routing.decision_source': string;
      'routing.error_message': string;
    },
  },
  [MODEL_SLASH_COMMAND_CALL_COUNT]: {
    description: 'Counts model slash command calls.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (modelSlashCommandCallCounter = c),
    attributes: {} as {
      'slash_command.model.model_name': string;
    },
  },
  [EVENT_CHAT_COMPRESSION]: {
    description: 'Counts chat compression events.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (chatCompressionCounter = c),
    attributes: {} as {
      tokens_before: number;
      tokens_after: number;
    },
  },
} as const;

const HISTOGRAM_DEFINITIONS = {
  [TOOL_CALL_LATENCY]: {
    description: 'Latency of tool calls in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (toolCallLatencyHistogram = h),
    attributes: {} as {
      function_name: string;
    },
  },
  [API_REQUEST_LATENCY]: {
    description: 'Latency of API requests in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (apiRequestLatencyHistogram = h),
    attributes: {} as {
      model: string;
    },
  },
  [MODEL_ROUTING_LATENCY]: {
    description: 'Latency of model routing decisions in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (modelRoutingLatencyHistogram = h),
    attributes: {} as {
      'routing.decision_model': string;
      'routing.decision_source': string;
    },
  },
  [GEN_AI_CLIENT_TOKEN_USAGE]: {
    description: 'Number of input and output tokens used.',
    unit: 'token',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (genAiClientTokenUsageHistogram = h),
    attributes: {} as {
      'gen_ai.operation.name': string;
      'gen_ai.provider.name': string;
      'gen_ai.token.type': 'input' | 'output';
      'gen_ai.request.model'?: string;
      'gen_ai.response.model'?: string;
      'server.address'?: string;
      'server.port'?: number;
    },
  },
  [GEN_AI_CLIENT_OPERATION_DURATION]: {
    description: 'GenAI operation duration.',
    unit: 's',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (genAiClientOperationDurationHistogram = h),
    attributes: {} as {
      'gen_ai.operation.name': string;
      'gen_ai.provider.name': string;
      'gen_ai.request.model'?: string;
      'gen_ai.response.model'?: string;
      'server.address'?: string;
      'server.port'?: number;
      'error.type'?: string;
    },
  },
} as const;

const PERFORMANCE_COUNTER_DEFINITIONS = {
  [REGRESSION_DETECTION]: {
    description: 'Performance regression detection events.',
    valueType: ValueType.INT,
    assign: (c: Counter) => (regressionDetectionCounter = c),
    attributes: {} as {
      metric: string;
      severity: 'low' | 'medium' | 'high';
      current_value: number;
      baseline_value: number;
    },
  },
} as const;

const PERFORMANCE_HISTOGRAM_DEFINITIONS = {
  [STARTUP_TIME]: {
    description:
      'CLI startup time in milliseconds, broken down by initialization phase.',
    unit: 'ms',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (startupTimeHistogram = h),
    attributes: {} as {
      phase: string;
      details?: Record<string, string | number | boolean>;
    },
  },
  [MEMORY_USAGE]: {
    description: 'Memory usage in bytes.',
    unit: 'bytes',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (memoryUsageGauge = h),
    attributes: {} as {
      memory_type: MemoryMetricType;
      component?: string;
    },
  },
  [CPU_USAGE]: {
    description: 'CPU usage percentage.',
    unit: 'percent',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (cpuUsageGauge = h),
    attributes: {} as {
      component?: string;
    },
  },
  [TOOL_QUEUE_DEPTH]: {
    description: 'Number of tools in execution queue.',
    unit: 'count',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (toolQueueDepthGauge = h),
    attributes: {} as Record<string, never>,
  },
  [TOOL_EXECUTION_BREAKDOWN]: {
    description: 'Tool execution time breakdown by phase in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (toolExecutionBreakdownHistogram = h),
    attributes: {} as {
      function_name: string;
      phase: ToolExecutionPhase;
    },
  },
  [TOKEN_EFFICIENCY]: {
    description:
      'Token efficiency metrics (tokens per operation, cache hit rate, etc.).',
    unit: 'ratio',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (tokenEfficiencyHistogram = h),
    attributes: {} as {
      model: string;
      metric: string;
      context?: string;
    },
  },
  [API_REQUEST_BREAKDOWN]: {
    description: 'API request time breakdown by phase in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
    assign: (h: Histogram) => (apiRequestBreakdownHistogram = h),
    attributes: {} as {
      model: string;
      phase: ApiRequestPhase;
    },
  },
  [PERFORMANCE_SCORE]: {
    description: 'Composite performance score (0-100).',
    unit: 'score',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (performanceScoreGauge = h),
    attributes: {} as {
      category: string;
      baseline?: number;
    },
  },
  [REGRESSION_PERCENTAGE_CHANGE]: {
    description:
      'Percentage change compared to baseline for detected regressions.',
    unit: 'percent',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (regressionPercentageChangeHistogram = h),
    attributes: {} as {
      metric: string;
      severity: 'low' | 'medium' | 'high';
      current_value: number;
      baseline_value: number;
    },
  },
  [BASELINE_COMPARISON]: {
    description:
      'Performance comparison to established baseline (percentage change).',
    unit: 'percent',
    valueType: ValueType.DOUBLE,
    assign: (h: Histogram) => (baselineComparisonHistogram = h),
    attributes: {} as {
      metric: string;
      category: string;
      current_value: number;
      baseline_value: number;
    },
  },
} as const;

type AllMetricDefs = typeof COUNTER_DEFINITIONS &
  typeof HISTOGRAM_DEFINITIONS &
  typeof PERFORMANCE_COUNTER_DEFINITIONS &
  typeof PERFORMANCE_HISTOGRAM_DEFINITIONS;

export type MetricDefinitions = {
  [K in keyof AllMetricDefs]: {
    attributes: AllMetricDefs[K]['attributes'];
  };
};

export enum FileOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
}

export enum PerformanceMetricType {
  STARTUP = 'startup',
  MEMORY = 'memory',
  CPU = 'cpu',
  TOOL_EXECUTION = 'tool_execution',
  API_REQUEST = 'api_request',
  TOKEN_EFFICIENCY = 'token_efficiency',
}

export enum MemoryMetricType {
  HEAP_USED = 'heap_used',
  HEAP_TOTAL = 'heap_total',
  EXTERNAL = 'external',
  RSS = 'rss',
}

export enum ToolExecutionPhase {
  VALIDATION = 'validation',
  PREPARATION = 'preparation',
  EXECUTION = 'execution',
  RESULT_PROCESSING = 'result_processing',
}

export enum ApiRequestPhase {
  REQUEST_PREPARATION = 'request_preparation',
  NETWORK_LATENCY = 'network_latency',
  RESPONSE_PROCESSING = 'response_processing',
  TOKEN_PROCESSING = 'token_processing',
}

export enum GenAiOperationName {
  GENERATE_CONTENT = 'generate_content',
}

export enum GenAiProviderName {
  GCP_GEN_AI = 'gcp.gen_ai',
  GCP_VERTEX_AI = 'gcp.vertex_ai',
}

export enum GenAiTokenType {
  INPUT = 'input',
  OUTPUT = 'output',
}

let cliMeter: Meter | undefined;
let toolCallCounter: Counter | undefined;
let toolCallLatencyHistogram: Histogram | undefined;
let apiRequestCounter: Counter | undefined;
let apiRequestLatencyHistogram: Histogram | undefined;
let tokenUsageCounter: Counter | undefined;
let sessionCounter: Counter | undefined;
let fileOperationCounter: Counter | undefined;
let chatCompressionCounter: Counter | undefined;
let invalidChunkCounter: Counter | undefined;
let contentRetryCounter: Counter | undefined;
let contentRetryFailureCounter: Counter | undefined;
let modelRoutingLatencyHistogram: Histogram | undefined;
let modelRoutingFailureCounter: Counter | undefined;
let modelSlashCommandCallCounter: Counter | undefined;

// OpenTelemetry GenAI Semantic Convention Metrics
let genAiClientTokenUsageHistogram: Histogram | undefined;
let genAiClientOperationDurationHistogram: Histogram | undefined;

// Performance Monitoring Metrics
let startupTimeHistogram: Histogram | undefined;
let memoryUsageGauge: Histogram | undefined; // Using Histogram until ObservableGauge is available
let cpuUsageGauge: Histogram | undefined;
let toolQueueDepthGauge: Histogram | undefined;
let toolExecutionBreakdownHistogram: Histogram | undefined;
let tokenEfficiencyHistogram: Histogram | undefined;
let apiRequestBreakdownHistogram: Histogram | undefined;
let performanceScoreGauge: Histogram | undefined;
let regressionDetectionCounter: Counter | undefined;
let regressionPercentageChangeHistogram: Histogram | undefined;
let baselineComparisonHistogram: Histogram | undefined;
let isMetricsInitialized = false;
let isPerformanceMonitoringEnabled = false;

export function getMeter(): Meter | undefined {
  if (!cliMeter) {
    cliMeter = metrics.getMeter(SERVICE_NAME);
  }
  return cliMeter;
}

export function initializeMetrics(config: Config): void {
  if (isMetricsInitialized) return;

  const meter = getMeter();
  if (!meter) return;

  // Initialize core metrics
  Object.entries(COUNTER_DEFINITIONS).forEach(
    ([name, { description, valueType, assign }]) => {
      assign(meter.createCounter(name, { description, valueType }));
    },
  );

  Object.entries(HISTOGRAM_DEFINITIONS).forEach(
    ([name, { description, unit, valueType, assign }]) => {
      assign(meter.createHistogram(name, { description, unit, valueType }));
    },
  );

  // Increment session counter after all metrics are initialized
  sessionCounter?.add(1, baseMetricDefinition.getCommonAttributes(config));

  // Initialize performance monitoring metrics if enabled
  initializePerformanceMonitoring(config);

  isMetricsInitialized = true;
}

export function recordChatCompressionMetrics(
  config: Config,
  attributes: MetricDefinitions[typeof EVENT_CHAT_COMPRESSION]['attributes'],
) {
  if (!chatCompressionCounter || !isMetricsInitialized) return;
  chatCompressionCounter.add(1, {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  });
}

export function recordToolCallMetrics(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof TOOL_CALL_COUNT]['attributes'],
): void {
  if (!toolCallCounter || !toolCallLatencyHistogram || !isMetricsInitialized)
    return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };
  toolCallCounter.add(1, metricAttributes);
  toolCallLatencyHistogram.record(durationMs, {
    ...baseMetricDefinition.getCommonAttributes(config),
    function_name: attributes.function_name,
  });
}

export function recordCustomTokenUsageMetrics(
  config: Config,
  tokenCount: number,
  attributes: MetricDefinitions[typeof TOKEN_USAGE]['attributes'],
): void {
  if (!tokenUsageCounter || !isMetricsInitialized) return;
  tokenUsageCounter.add(tokenCount, {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  });
}

export function recordCustomApiResponseMetrics(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof API_REQUEST_COUNT]['attributes'],
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    model: attributes.model,
    status_code: attributes.status_code ?? 'ok',
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...baseMetricDefinition.getCommonAttributes(config),
    model: attributes.model,
  });
}

export function recordApiErrorMetrics(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof API_REQUEST_COUNT]['attributes'],
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    model: attributes.model,
    status_code: attributes.status_code ?? 'error',
    error_type: attributes.error_type ?? 'unknown',
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...baseMetricDefinition.getCommonAttributes(config),
    model: attributes.model,
  });
}

export function recordFileOperationMetric(
  config: Config,
  attributes: MetricDefinitions[typeof FILE_OPERATION_COUNT]['attributes'],
): void {
  if (!fileOperationCounter || !isMetricsInitialized) return;
  fileOperationCounter.add(1, {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  });
}

// --- New Metric Recording Functions ---

/**
 * Records a metric for when an invalid chunk is received from a stream.
 */
export function recordInvalidChunk(config: Config): void {
  if (!invalidChunkCounter || !isMetricsInitialized) return;
  invalidChunkCounter.add(1, baseMetricDefinition.getCommonAttributes(config));
}

/**
 * Records a metric for when a retry is triggered due to a content error.
 */
export function recordContentRetry(config: Config): void {
  if (!contentRetryCounter || !isMetricsInitialized) return;
  contentRetryCounter.add(1, baseMetricDefinition.getCommonAttributes(config));
}

/**
 * Records a metric for when all content error retries have failed for a request.
 */
export function recordContentRetryFailure(config: Config): void {
  if (!contentRetryFailureCounter || !isMetricsInitialized) return;
  contentRetryFailureCounter.add(
    1,
    baseMetricDefinition.getCommonAttributes(config),
  );
}

export function recordModelSlashCommand(
  config: Config,
  event: ModelSlashCommandEvent,
): void {
  if (!modelSlashCommandCallCounter || !isMetricsInitialized) return;
  modelSlashCommandCallCounter.add(1, {
    ...baseMetricDefinition.getCommonAttributes(config),
    'slash_command.model.model_name': event.model_name,
  });
}

export function recordModelRoutingMetrics(
  config: Config,
  event: ModelRoutingEvent,
): void {
  if (
    !modelRoutingLatencyHistogram ||
    !modelRoutingFailureCounter ||
    !isMetricsInitialized
  )
    return;

  modelRoutingLatencyHistogram.record(event.routing_latency_ms, {
    ...baseMetricDefinition.getCommonAttributes(config),
    'routing.decision_model': event.decision_model,
    'routing.decision_source': event.decision_source,
  });

  if (event.failed) {
    modelRoutingFailureCounter.add(1, {
      ...baseMetricDefinition.getCommonAttributes(config),
      'routing.decision_source': event.decision_source,
      'routing.error_message': event.error_message,
    });
  }
}

// OpenTelemetry GenAI Semantic Convention Recording Functions

export function recordGenAiClientTokenUsage(
  config: Config,
  tokenCount: number,
  attributes: MetricDefinitions[typeof GEN_AI_CLIENT_TOKEN_USAGE]['attributes'],
): void {
  if (!genAiClientTokenUsageHistogram || !isMetricsInitialized) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  genAiClientTokenUsageHistogram.record(tokenCount, metricAttributes);
}

export function recordGenAiClientOperationDuration(
  config: Config,
  durationSeconds: number,
  attributes: MetricDefinitions[typeof GEN_AI_CLIENT_OPERATION_DURATION]['attributes'],
): void {
  if (!genAiClientOperationDurationHistogram || !isMetricsInitialized) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  genAiClientOperationDurationHistogram.record(
    durationSeconds,
    metricAttributes,
  );
}

export function getConventionAttributes(event: {
  model: string;
  auth_type?: string;
}): {
  'gen_ai.operation.name': GenAiOperationName;
  'gen_ai.provider.name': GenAiProviderName;
  'gen_ai.request.model': string;
  'gen_ai.response.model': string;
} {
  const operationName = getGenAiOperationName();
  const provider = getGenAiProvider(event.auth_type);

  return {
    'gen_ai.operation.name': operationName,
    'gen_ai.provider.name': provider,
    'gen_ai.request.model': event.model,
    'gen_ai.response.model': event.model,
  };
}

/**
 * Maps authentication type to GenAI provider name following OpenTelemetry conventions
 */
function getGenAiProvider(authType?: string): GenAiProviderName {
  switch (authType) {
    case AuthType.USE_VERTEX_AI:
    case AuthType.CLOUD_SHELL:
    case AuthType.LOGIN_WITH_GOOGLE:
      return GenAiProviderName.GCP_VERTEX_AI;
    case AuthType.USE_GEMINI:
    default:
      return GenAiProviderName.GCP_GEN_AI;
  }
}

function getGenAiOperationName(): GenAiOperationName {
  return GenAiOperationName.GENERATE_CONTENT;
}

// Performance Monitoring Functions

export function initializePerformanceMonitoring(config: Config): void {
  const meter = getMeter();
  if (!meter) return;

  // Check if performance monitoring is enabled in config
  // For now, enable performance monitoring when telemetry is enabled
  // TODO: Add specific performance monitoring settings to config
  isPerformanceMonitoringEnabled = config.getTelemetryEnabled();

  if (!isPerformanceMonitoringEnabled) return;

  Object.entries(PERFORMANCE_COUNTER_DEFINITIONS).forEach(
    ([name, { description, valueType, assign }]) => {
      assign(meter.createCounter(name, { description, valueType }));
    },
  );

  Object.entries(PERFORMANCE_HISTOGRAM_DEFINITIONS).forEach(
    ([name, { description, unit, valueType, assign }]) => {
      assign(meter.createHistogram(name, { description, unit, valueType }));
    },
  );
}

export function recordStartupPerformance(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof STARTUP_TIME]['attributes'],
): void {
  if (!startupTimeHistogram || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    phase: attributes.phase,
    ...attributes.details,
  };

  startupTimeHistogram.record(durationMs, metricAttributes);
}

export function recordMemoryUsage(
  config: Config,
  bytes: number,
  attributes: MetricDefinitions[typeof MEMORY_USAGE]['attributes'],
): void {
  if (!memoryUsageGauge || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  memoryUsageGauge.record(bytes, metricAttributes);
}

export function recordCpuUsage(
  config: Config,
  percentage: number,
  attributes: MetricDefinitions[typeof CPU_USAGE]['attributes'],
): void {
  if (!cpuUsageGauge || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  cpuUsageGauge.record(percentage, metricAttributes);
}

export function recordToolQueueDepth(config: Config, queueDepth: number): void {
  if (!toolQueueDepthGauge || !isPerformanceMonitoringEnabled) return;

  const attributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
  };

  toolQueueDepthGauge.record(queueDepth, attributes);
}

export function recordToolExecutionBreakdown(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof TOOL_EXECUTION_BREAKDOWN]['attributes'],
): void {
  if (!toolExecutionBreakdownHistogram || !isPerformanceMonitoringEnabled)
    return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  toolExecutionBreakdownHistogram.record(durationMs, metricAttributes);
}

export function recordTokenEfficiency(
  config: Config,
  value: number,
  attributes: MetricDefinitions[typeof TOKEN_EFFICIENCY]['attributes'],
): void {
  if (!tokenEfficiencyHistogram || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  tokenEfficiencyHistogram.record(value, metricAttributes);
}

export function recordApiRequestBreakdown(
  config: Config,
  durationMs: number,
  attributes: MetricDefinitions[typeof API_REQUEST_BREAKDOWN]['attributes'],
): void {
  if (!apiRequestBreakdownHistogram || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  apiRequestBreakdownHistogram.record(durationMs, metricAttributes);
}

export function recordPerformanceScore(
  config: Config,
  score: number,
  attributes: MetricDefinitions[typeof PERFORMANCE_SCORE]['attributes'],
): void {
  if (!performanceScoreGauge || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  performanceScoreGauge.record(score, metricAttributes);
}

export function recordPerformanceRegression(
  config: Config,
  attributes: MetricDefinitions[typeof REGRESSION_DETECTION]['attributes'],
): void {
  if (!regressionDetectionCounter || !isPerformanceMonitoringEnabled) return;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  regressionDetectionCounter.add(1, metricAttributes);

  if (attributes.baseline_value !== 0 && regressionPercentageChangeHistogram) {
    const percentageChange =
      ((attributes.current_value - attributes.baseline_value) /
        attributes.baseline_value) *
      100;
    regressionPercentageChangeHistogram.record(
      percentageChange,
      metricAttributes,
    );
  }
}

export function recordBaselineComparison(
  config: Config,
  attributes: MetricDefinitions[typeof BASELINE_COMPARISON]['attributes'],
): void {
  if (!baselineComparisonHistogram || !isPerformanceMonitoringEnabled) return;

  if (attributes.baseline_value === 0) {
    diag.warn('Baseline value is zero, skipping comparison.');
    return;
  }
  const percentageChange =
    ((attributes.current_value - attributes.baseline_value) /
      attributes.baseline_value) *
    100;

  const metricAttributes: Attributes = {
    ...baseMetricDefinition.getCommonAttributes(config),
    ...attributes,
  };

  baselineComparisonHistogram.record(percentageChange, metricAttributes);
}

// Utility function to check if performance monitoring is enabled
export function isPerformanceMonitoringActive(): boolean {
  return isPerformanceMonitoringEnabled && isMetricsInitialized;
}

/**
 * Token usage recording that emits both custom and convention metrics.
 */
export function recordTokenUsageMetrics(
  config: Config,
  tokenCount: number,
  attributes: {
    model: string;
    type: 'input' | 'output' | 'thought' | 'cache' | 'tool';
    genAiAttributes?: {
      'gen_ai.operation.name': string;
      'gen_ai.provider.name': string;
      'gen_ai.request.model'?: string;
      'gen_ai.response.model'?: string;
      'server.address'?: string;
      'server.port'?: number;
    };
  },
): void {
  recordCustomTokenUsageMetrics(config, tokenCount, {
    model: attributes.model,
    type: attributes.type,
  });

  if (
    (attributes.type === 'input' || attributes.type === 'output') &&
    attributes.genAiAttributes
  ) {
    recordGenAiClientTokenUsage(config, tokenCount, {
      ...attributes.genAiAttributes,
      'gen_ai.token.type': attributes.type,
    });
  }
}

/**
 * Operation latency recording that emits both custom and convention metrics.
 */
export function recordApiResponseMetrics(
  config: Config,
  durationMs: number,
  attributes: {
    model: string;
    status_code?: number | string;
    genAiAttributes?: {
      'gen_ai.operation.name': string;
      'gen_ai.provider.name': string;
      'gen_ai.request.model'?: string;
      'gen_ai.response.model'?: string;
      'server.address'?: string;
      'server.port'?: number;
      'error.type'?: string;
    };
  },
): void {
  recordCustomApiResponseMetrics(config, durationMs, {
    model: attributes.model,
    status_code: attributes.status_code,
  });

  if (attributes.genAiAttributes) {
    const durationSeconds = durationMs / 1000;
    recordGenAiClientOperationDuration(config, durationSeconds, {
      ...attributes.genAiAttributes,
    });
  }
}
