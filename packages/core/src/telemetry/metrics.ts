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
  METRIC_TOKEN_INPUT_COUNT,
  METRIC_SESSION_COUNT,
} from './constants.js';

let cliMeter: Meter | undefined;
let toolCallCounter: Counter | undefined;
let toolCallLatencyHistogram: Histogram | undefined;
let apiRequestCounter: Counter | undefined;
let apiRequestLatencyHistogram: Histogram | undefined;
let tokenInputCounter: Counter | undefined;
let isMetricsInitialized = false;

export function getMeter(): Meter | undefined {
  if (!cliMeter) {
    cliMeter = metrics.getMeter(SERVICE_NAME);
  }
  return cliMeter;
}

export function initializeMetrics(): void {
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
  tokenInputCounter = meter.createCounter(METRIC_TOKEN_INPUT_COUNT, {
    description: 'Counts the total number of input tokens sent to the API.',
    valueType: ValueType.INT,
  });

  const sessionCounter = meter.createCounter(METRIC_SESSION_COUNT, {
    description: 'Count of CLI sessions started.',
    valueType: ValueType.INT,
  });
  sessionCounter.add(1);
  isMetricsInitialized = true;
}

export function recordToolCallMetrics(
  functionName: string,
  durationMs: number,
  success: boolean,
): void {
  if (!toolCallCounter || !toolCallLatencyHistogram || !isMetricsInitialized)
    return;

  const metricAttributes: Attributes = {
    function_name: functionName,
    success,
  };
  toolCallCounter.add(1, metricAttributes);
  toolCallLatencyHistogram.record(durationMs, {
    function_name: functionName,
  });
}

export function recordApiRequestMetrics(
  model: string,
  inputTokenCount: number,
): void {
  if (!tokenInputCounter || !isMetricsInitialized) return;
  tokenInputCounter.add(inputTokenCount, { model });
}

export function recordApiResponseMetrics(
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
    model,
    status_code: statusCode ?? (error ? 'error' : 'ok'),
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, { model });
}

export function recordApiErrorMetrics(
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
    model,
    status_code: statusCode ?? 'error',
    error_type: errorType ?? 'unknown',
  };
  apiRequestCounter.add(1, metricAttributes);
  apiRequestLatencyHistogram.record(durationMs, { model });
}
