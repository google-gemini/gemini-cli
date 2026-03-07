/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  setupLocalMetricsReader,
  teardownLocalMetrics,
  getLocalMetricsSnapshot,
} from './localBuffer.js';

describe('Telemetry Local Buffer', () => {
  let meterProvider: MeterProvider;

  beforeEach(() => {
    // 1. Initialize our fresh local reader using the new factory function
    const reader = setupLocalMetricsReader();

    // 2. Create a fresh OTel engine just for this test,
    // passing our custom local bridge directly into the constructor.
    meterProvider = new MeterProvider({
      readers: [reader],
    });
  });

  afterEach(async () => {
    // Clean up the engine and the singleton after the test finishes
    await meterProvider.shutdown();
    teardownLocalMetrics();
  });

  it('should correctly capture and simplify OTel counters and histograms with attributes', async () => {
    const meter = meterProvider.getMeter('test-meter');

    // 1. Simulate an API Request Counter WITH an attribute
    const counter = meter.createCounter('gemini_cli.api.request.count');
    counter.add(10, { model: 'gemini-3.5' });
    counter.add(5, { model: 'gemini-3.5' }); // Total should be 15 for this model

    // 2. Simulate a Tool Execution Latency Histogram WITH an attribute
    const histogram = meter.createHistogram('gemini_cli.tool.call.latency');
    histogram.record(100, { function_name: 'search' });
    histogram.record(200, { function_name: 'search' });
    histogram.record(300, { function_name: 'search' }); // Count: 3, Sum: 600

    // 3. Pull the snapshot through our bridge utility
    const snapshot = await getLocalMetricsSnapshot();

    // 4. Prove the counter was flattened correctly into an array
    const requestStats = snapshot.counters['gemini_cli.api.request.count'];
    expect(requestStats).toBeDefined();
    expect(requestStats[0].value).toBe(15);
    expect(requestStats[0].attributes).toEqual({ model: 'gemini-3.5' }); // Proves we kept granularity!

    // 5. Prove the histogram was flattened correctly into an array
    const latencyStats = snapshot.histograms['gemini_cli.tool.call.latency'];
    expect(latencyStats).toBeDefined();
    expect(latencyStats[0].count).toBe(3);
    expect(latencyStats[0].sum).toBe(600);
    expect(latencyStats[0].min).toBe(100);
    expect(latencyStats[0].max).toBe(300);
    expect(latencyStats[0].attributes).toEqual({ function_name: 'search' }); // Proves we kept granularity!
  });
});
