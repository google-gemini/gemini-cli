/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { localMetricReader, getLocalMetricsSnapshot } from './localBuffer.js';

describe('Telemetry Local Buffer', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    // 1. Create a fresh OTel engine just for this test,
    // passing our custom local bridge directly into the constructor.
    meterProvider = new MeterProvider({
      readers: [localMetricReader],
    });
  });

  afterEach(async () => {
    // Clean up the engine after the test finishes
    await meterProvider.shutdown();
  });

  it('should correctly capture and simplify OTel counters and histograms', async () => {
    const meter = meterProvider.getMeter('test-meter');

    // --- SIMULATE THE ENGINE RECORDING DATA ---

    // 1. Simulate an API Request Counter
    const counter = meter.createCounter('gemini_cli.api.request.count');
    counter.add(10);
    counter.add(5); // Total should be 15

    // 2. Simulate a Tool Execution Latency Histogram (in ms)
    const histogram = meter.createHistogram('gemini_cli.tool.call.latency');
    histogram.record(100);
    histogram.record(200);
    histogram.record(300); // Count: 3, Sum: 600, Min: 100, Max: 300

    // --- TEST OUR BRIDGE ---

    // 3. Pull the snapshot through our bridge utility
    const snapshot = await getLocalMetricsSnapshot();

    // --- ASSERTIONS ---

    // 4. Prove the counter was flattened correctly
    expect(snapshot.counters['gemini_cli.api.request.count']).toBe(15);

    // 5. Prove the histogram was flattened correctly
    const latencyStats = snapshot.histograms['gemini_cli.tool.call.latency'];
    expect(latencyStats).toBeDefined();
    expect(latencyStats?.count).toBe(3);
    expect(latencyStats?.sum).toBe(600);
    expect(latencyStats?.min).toBe(100);
    expect(latencyStats?.max).toBe(300);
  });
});
