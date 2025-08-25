/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes, Meter, Counter, Histogram } from '@opentelemetry/api';
import { metrics, ValueType } from '@opentelemetry/api';
import {
  SERVICE_NAME,
  METRIC_TOOL_CALL_COUNT,
  METRIC_TOOL_CALL_LATENCY,
  METRIC_API_REQUEST_COUNT,
  METRIC_API_REQUEST_LATENCY,
  METRIC_TOKEN_USAGE,
  METRIC_SESSION_COUNT,
  METRIC_FILE_OPERATION_COUNT,
  EVENT_CHAT_COMPRESSION,
  METRIC_INVALID_CHUNK_COUNT,
  METRIC_CONTENT_RETRY_COUNT,
  METRIC_CONTENT_RETRY_FAILURE_COUNT,
} from './constants.js';
import type { Config } from '../config/config.js';
import type { DiffStat } from '../tools/tools.js';

export enum FileOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
}

let cliMeter: Meter | undefined;
let toolCallCounter: Counter | undefined;
let toolCallLatencyHistogram: Histogram | undefined;
let apiRequestCounter: Counter | undefined;
let apiRequestLatencyHistogram: Histogram | undefined;
let tokenUsageCounter: Counter | undefined;
let fileOperationCounter: Counter | undefined;
let chatCompressionCounter: Counter | undefined;
let invalidChunkCounter: Counter | undefined;
let contentRetryCounter: Counter | undefined;
let contentRetryFailureCounter: Counter | undefined;
let isMetricsInitialized = false;

function getCommonAttributes(config: Config): Attributes {
  return {
    'session.id': config.getSessionId(),
  };
}

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

  toolCallCounter = meter.createCounter(METRIC_TOOL_CALL_COUNT, {
    description: 'Counts tool calls, tagged by function name and success.',
    valueType: ValueType.INT,
  });
  toolCallLatencyHistogram = meter.createHistogram(METRIC_TOOL_CALL_LATENCY, {
    description: 'Latency of tool calls in milliseconds.',
    unit: 'ms',
    valueType: ValueType.INT,
  });
  apiRequestCounter = meter.createCounter(METRIC_API_REQUEST_COUNT, {
    description: 'Counts API requests, tagged by model and status.',
    valueType: ValueType.INT,
  });
  apiRequestLatencyHistogram = meter.createHistogram(
    METRIC_API_REQUEST_LATENCY,
    {
      description: 'Latency of API requests in milliseconds.',
      unit: 'ms',
      valueType: ValueType.INT,
    },
  );
  tokenUsageCounter = meter.createCounter(METRIC_TOKEN_USAGE, {
    description: 'Counts the total number of tokens used.',
    valueType: ValueType.INT,
  });
  fileOperationCounter = meter.createCounter(METRIC_FILE_OPERATION_COUNT, {
    description: 'Counts file operations (create, read, update).',
    valueType: ValueType.INT,
  });
  chatCompressionCounter = meter.createCounter(EVENT_CHAT_COMPRESSION, {
    description: 'Counts chat compression events.',
    valueType: ValueType.INT,
  });

  // New counters for content errors
  invalidChunkCounter = meter.createCounter(METRIC_INVALID_CHUNK_COUNT, {
    description: 'Counts invalid chunks received from a stream.',
    valueType: ValueType.INT,
  });
  contentRetryCounter = meter.createCounter(METRIC_CONTENT_RETRY_COUNT, {
    description: 'Counts retries due to content errors (e.g., empty stream).',
    valueType: ValueType.INT,
  });
  contentRetryFailureCounter = meter.createCounter(
    METRIC_CONTENT_RETRY_FAILURE_COUNT,
    {
      description: 'Counts occurrences of all content retries failing.',
      valueType: ValueType.INT,
    },
  );

  const sessionCounter = meter.createCounter(METRIC_SESSION_COUNT, {
    description: 'Count of CLI sessions started.',
    valueType: ValueType.INT,
  });
  sessionCounter.add(1, getCommonAttributes(config));
  isMetricsInitialized = true;
}

export function recordChatCompressionMetrics(
  config: Config,
  args: { tokens_before: number; tokens_after: number },
) {
  if (!chatCompressionCounter || !isMetricsInitialized) return;
  chatCompressionCounter.add(1, {
    ...getCommonAttributes(config),
    ...args,
  });
}

export function recordToolCallMetrics(
  config: Config,
  functionName: string,
  durationMs: number,
  success: boolean,
  decision?: 'accept' | 'reject' | 'modify' | 'auto_accept',
  tool_type?: 'native' | 'mcp',
): void {
  if (!toolCallCounter || !toolCallLatencyHistogram || !isMetricsInitialized)
    return;

  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    function_name: functionName,
    success,
    decision,
    tool_type,
  };
  toolCallCounter.add(1, metricAttributes);
  toolCallLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    function_name: functionName,
  });
}

export function recordTokenUsageMetrics(
  config: Config,
  model: string,
  tokenCount: number,
  type: 'input' | 'output' | 'thought' | 'cache' | 'tool',
): void {
  if (!tokenUsageCounter || !isMetricsInitialized) return;
  tokenUsageCounter.add(tokenCount, {
    ...getCommonAttributes(config),
    model,
    type,
  });
}

export function recordApiResponseMetrics(
  config: Config,
  model: string,
  durationMs: number,
  statusCode?: number | string,
  error?: string,
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    model,
    status_code: statusCode ?? (error ? 'error' : 'ok'),
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    model,
  });
}

export function recordApiErrorMetrics(
  config: Config,
  model: string,
  durationMs: number,
  statusCode?: number | string,
  errorType?: string,
): void {
  if (
    !apiRequestCounter ||
    !apiRequestLatencyHistogram ||
    !isMetricsInitialized
  )
    return;
  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    model,
    status_code: statusCode ?? 'error',
    error_type: errorType ?? 'unknown',
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, {
    ...getCommonAttributes(config),
    model,
  });
}

export function recordFileOperationMetric(
  config: Config,
  operation: FileOperation,
  lines?: number,
  mimetype?: string,
  extension?: string,
  diffStat?: DiffStat,
  programming_language?: string,
): void {
  if (!fileOperationCounter || !isMetricsInitialized) return;
  const attributes: Attributes = {
    ...getCommonAttributes(config),
    operation,
  };
  if (lines !== undefined) attributes['lines'] = lines;
  if (mimetype !== undefined) attributes['mimetype'] = mimetype;
  if (extension !== undefined) attributes['extension'] = extension;
  if (diffStat !== undefined) {
    attributes['ai_added_lines'] = diffStat.ai_added_lines;
    attributes['ai_removed_lines'] = diffStat.ai_removed_lines;
    attributes['user_added_lines'] = diffStat.user_added_lines;
    attributes['user_removed_lines'] = diffStat.user_removed_lines;
  }
  if (programming_language !== undefined) {
    attributes['programming_language'] = programming_language;
  }
  fileOperationCounter.add(1, attributes);
}

// --- New Metric Recording Functions ---

/**
 * Records a metric for when an invalid chunk is received from a stream.
 */
export function recordInvalidChunk(config: Config): void {
  if (!invalidChunkCounter || !isMetricsInitialized) return;
  invalidChunkCounter.add(1, getCommonAttributes(config));
}

/**
 * Records a metric for when a retry is triggered due to a content error.
 */
export function recordContentRetry(config: Config): void {
  if (!contentRetryCounter || !isMetricsInitialized) return;
  contentRetryCounter.add(1, getCommonAttributes(config));
}

/**
 * Records a metric for when all content error retries have failed for a request.
 */
export function recordContentRetryFailure(config: Config): void {
  if (!contentRetryFailureCounter || !isMetricsInitialized) return;
  contentRetryFailureCounter.add(1, getCommonAttributes(config));
}
