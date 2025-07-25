/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  metrics,
  Attributes,
  ValueType,
  Meter,
  Counter,
  Histogram,
} from '@opentelemetry/api';
import {
  SERVICE_NAME,
  METRIC_TOOL_CALL_COUNT,
  METRIC_TOOL_CALL_LATENCY,
  METRIC_API_REQUEST_COUNT,
  METRIC_API_REQUEST_LATENCY,
  METRIC_TOKEN_USAGE,
  METRIC_SESSION_COUNT,
  METRIC_FILE_OPERATION_COUNT,
} from './constants.js';
import { Config } from '../config/config.js';

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
  const sessionCounter = meter.createCounter(METRIC_SESSION_COUNT, {
    description: 'Count of CLI sessions started.',
    valueType: ValueType.INT,
  });
  sessionCounter.add(1, getCommonAttributes(config));
  isMetricsInitialized = true;
}

export function recordToolCallMetrics(
  config: Config,
  functionName: string,
  durationMs: number,
  success: boolean,
  decision?: 'accept' | 'reject' | 'modify',
): void {
  if (!toolCallCounter || !toolCallLatencyHistogram || !isMetricsInitialized)
    return;

  const metricAttributes: Attributes = {
    ...getCommonAttributes(config),
    function_name: functionName,
    success,
    decision,
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
): void {
  if (!fileOperationCounter || !isMetricsInitialized) return;
  const attributes: Attributes = {
    ...getCommonAttributes(config),
    operation,
  };
  if (lines !== undefined) attributes.lines = lines;
  if (mimetype !== undefined) attributes.mimetype = mimetype;
  if (extension !== undefined) attributes.extension = extension;
  fileOperationCounter.add(1, attributes);
}
