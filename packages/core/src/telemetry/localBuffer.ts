/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
  DataPointType,
  AggregationTemporality,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';

// Local exporter to maintain a rolling window of cumulative metrics in memory.
export const localMetricExporter = new InMemoryMetricExporter(
  AggregationTemporality.CUMULATIVE,
);

export const localMetricReader = new PeriodicExportingMetricReader({
  exporter: localMetricExporter,
  exportIntervalMillis: 1000,
});

/**
 * Simplified representation of current telemetry data.
 */
export interface PerfSnapshot {
  counters: Record<string, number>;
  histograms: Record<
    string,
    { count: number; sum: number; min?: number; max?: number }
  >;
}

/**
 * Forces a flush of the local metric reader and returns a flattened snapshot
 * of the current telemetry state.
 */
export const getLocalMetricsSnapshot = async (): Promise<PerfSnapshot> => {
  await localMetricReader.forceFlush();
  // getMetrics() is synchronous, no await needed
  const resourceMetricsArray = localMetricExporter.getMetrics();
  localMetricExporter.reset();
  return simplifyMetrics(resourceMetricsArray);
};

interface HistogramValue {
  count: number;
  sum: number;
  min?: number;
  max?: number;
}

function isHistogramValue(value: unknown): value is HistogramValue {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Keep this single inline disable to inspect the external object!
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const record = value as Record<string, unknown>;
  return (
    typeof record['count'] === 'number' && typeof record['sum'] === 'number'
  );
}

/**
 * Flattens OTel ResourceMetrics[] into a localized PerfSnapshot.
 */
function simplifyMetrics(
  resourceMetricsArray: ResourceMetrics[] | undefined,
): PerfSnapshot {
  const snapshot: PerfSnapshot = {
    // Reverted to standard objects so the strict linter doesn't throw errors
    counters: {},
    histograms: {},
  };

  if (!resourceMetricsArray || resourceMetricsArray.length === 0) {
    return snapshot;
  }

  for (const rm of resourceMetricsArray) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        const name = metric.descriptor.name;

        // Security: Prevent prototype pollution without breaking strict TypeScript typing
        if (
          name === '__proto__' ||
          name === 'constructor' ||
          name === 'prototype'
        ) {
          continue;
        }

        // 1. Handle regular Counters (SUM)
        if (metric.dataPointType === DataPointType.SUM) {
          let total = 0;
          for (const dp of metric.dataPoints) {
             
            const rawValue: unknown = dp.value;
            if (typeof rawValue === 'number') {
              total += rawValue;
            }
          }
          snapshot.counters[name] = total;
        }

        // 2. Handle complex Latency/Memory distributions (HISTOGRAM)
        else if (metric.dataPointType === DataPointType.HISTOGRAM) {
          let count = 0;
          let sum = 0;
          let min = Infinity;
          let max = -Infinity;

          for (const dp of metric.dataPoints) {
             
            const rawValue: unknown = dp.value;

            if (isHistogramValue(rawValue)) {
              count += rawValue.count;
              sum += rawValue.sum;
              if (rawValue.min !== undefined) min = Math.min(min, rawValue.min);
              if (rawValue.max !== undefined) max = Math.max(max, rawValue.max);
            }
          }

          snapshot.histograms[name] = {
            count,
            sum,
            min: min !== Infinity ? min : undefined,
            max: max !== -Infinity ? max : undefined,
          };
        }
      }
    }
  }

  return snapshot;
}
