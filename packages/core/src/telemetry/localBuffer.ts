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

// Use mutable let variables instead of constants so they can be reset on re-auth
export let localMetricExporter: InMemoryMetricExporter | undefined;
export let localMetricReader: PeriodicExportingMetricReader | undefined;

/**
 * Initializes fresh instances of the local metric reader and exporter.
 * Called by the OTel SDK initialization sequence.
 */
export function setupLocalMetricsReader(): PeriodicExportingMetricReader {
  localMetricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );

  localMetricReader = new PeriodicExportingMetricReader({
    exporter: localMetricExporter,
    // Fix Issue #4: Set interval to 24 hours (86,400,000 ms).
    // We rely entirely on forceFlush() when the /perf command is run.
    exportIntervalMillis: 86400000,
  });

  return localMetricReader;
}

/**
 * Clears the local reader references so it can be re-bound during re-auth.
 */
export function teardownLocalMetrics(): void {
  localMetricExporter = undefined;
  localMetricReader = undefined;
}

/**
 * Simplified representation of current telemetry data, retaining attributes for granularity.
 * (Fixes Issue #3)
 */
export interface PerfSnapshot {
  counters: Record<
    string,
    Array<{ value: number; attributes: Record<string, unknown> }>
  >;
  histograms: Record<
    string,
    Array<{
      count: number;
      sum: number;
      min?: number;
      max?: number;
      attributes: Record<string, unknown>;
    }>
  >;
}

/**
 * Forces a flush of the local metric reader and returns a flattened snapshot
 * of the current telemetry state.
 */
export const getLocalMetricsSnapshot = async (): Promise<PerfSnapshot> => {
  // Guard clause in case it hasn't been initialized
  if (!localMetricReader || !localMetricExporter) {
    return { counters: {}, histograms: {} };
  }

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
    // Standard objects so the strict linter doesn't throw errors
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
          if (!snapshot.counters[name]) {
            snapshot.counters[name] = [];
          }

          for (const dp of metric.dataPoints) {
            const rawValue: unknown = dp.value;
            if (typeof rawValue === 'number') {
              snapshot.counters[name].push({
                value: rawValue,
                attributes: dp.attributes || {},
              });
            }
          }
        }

        // 2. Handle complex Latency/Memory distributions (HISTOGRAM)
        else if (metric.dataPointType === DataPointType.HISTOGRAM) {
          if (!snapshot.histograms[name]) {
            snapshot.histograms[name] = [];
          }

          for (const dp of metric.dataPoints) {
            const rawValue: unknown = dp.value;

            if (isHistogramValue(rawValue)) {
              snapshot.histograms[name].push({
                count: rawValue.count,
                sum: rawValue.sum,
                min: rawValue.min !== Infinity ? rawValue.min : undefined,
                max: rawValue.max !== -Infinity ? rawValue.max : undefined,
                attributes: dp.attributes || {},
              });
            }
          }
        }
      }
    }
  }

  return snapshot;
}
