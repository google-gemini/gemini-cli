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
  return simplifyMetrics(resourceMetricsArray);
};

/**
 * Flattens OTel ResourceMetrics[] into a localized PerfSnapshot.
 */
function simplifyMetrics(
  resourceMetricsArray: ResourceMetrics[] | undefined,
): PerfSnapshot {
  const snapshot: PerfSnapshot = { counters: {}, histograms: {} };

  if (!resourceMetricsArray || resourceMetricsArray.length === 0) {
    return snapshot;
  }

  for (const rm of resourceMetricsArray) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        const name = metric.descriptor.name;

        if (metric.dataPointType === DataPointType.SUM) {
          let total = 0;
          for (const dp of metric.dataPoints) {
            // The linter knows this is already a number
            total += dp.value;
          }
          snapshot.counters[name] = total;
        } else if (metric.dataPointType === DataPointType.HISTOGRAM) {
          let count = 0;
          let sum = 0;
          let min = Number.MAX_SAFE_INTEGER;
          let max = Number.MIN_SAFE_INTEGER;

          for (const dp of metric.dataPoints) {
            // Match Google's internal style for bypassing strict object casts
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const val = dp.value as {
              count: number;
              sum: number;
              min?: number;
              max?: number;
            };
            count += val.count;
            sum += val.sum;
            if (val.min !== undefined) min = Math.min(min, val.min);
            if (val.max !== undefined) max = Math.max(max, val.max);
          }

          snapshot.histograms[name] = {
            count,
            sum,
            min: min === Number.MAX_SAFE_INTEGER ? undefined : min,
            max: max === Number.MIN_SAFE_INTEGER ? undefined : max,
          };
        }
      }
    }
  }

  return snapshot;
}
