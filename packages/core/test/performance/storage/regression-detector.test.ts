/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { RegressionDetector } from '../../../src/performance/storage/regression-detector.js';
import type { PerformanceData } from '../../../src/performance/types.js';

describe('RegressionDetector', () => {
  let detector: RegressionDetector;
  const testBaselineDir = path.join(process.cwd(), '.test-baselines');

  beforeEach(() => {
    detector = new RegressionDetector();
    // Override baseline directory for testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detector as any).baselineDir = testBaselineDir;
  });

  afterEach(async () => {
    try {
      await fs.rm(testBaselineDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createMockMetrics = (
    overrides: Partial<PerformanceData> = {},
  ): PerformanceData => ({
    timestamp: Date.now(),
    version: '1.0.0',

    startup: {
      total: 1000,
      phases: [{ name: 'init', duration: 1000, percentage: 100 }],
      suggestions: [],
    },

    memory: {
      current: {
        heapUsed: 100,
        heapTotal: 200,
        rss: 300,
        external: 0,
        arrayBuffers: 0, // ✅ REQUIRED FIX
      },
      trend: { direction: 'stable', ratePerMinute: 0 },
      stats: { min: 90, max: 110, avg: 100, count: 10 },
    },

    tools: {
      stats: {
        git: {
          callCount: 10,
          avgTime: 100,
          minTime: 50,
          maxTime: 150,
          successRate: 95,
          lastCalled: Date.now(),
        },
      },
      frequent: [],
      slow: [],
    },

    model: {
      stats: {
        'gemini-pro': {
          p50: 100,
          p95: 200,
          p99: 300,
          min: 50,
          max: 350,
          avg: 150,
          count: 100,
          totalTokens: 1000,
          avgTokens: 10,
          successRate: 99,
          cacheRate: 10,
        },
      },
      recentCalls: [],
      tokenUsage: { total: 1000, byModel: {} },
    },

    session: {
      current: {
        sessionId: 'test',
        duration: 60,
        tokens: { prompt: 0, completion: 0, total: 0 },
        toolsCalled: [],
        filesModified: 0,
        apiCalls: 0,
        errors: 0,
        commands: [],
      },
      historical: [],
      summary: {
        totalSessions: 0,
        totalTokens: 0,
        totalToolsCalled: 0,
        totalFilesModified: 0,
        avgSessionDuration: 0,
        avgTokensPerSession: 0,
      },
    },

    ...overrides,
  });

  it('should save and load baseline', async () => {
    const metrics = createMockMetrics();
    const filepath = await detector.saveBaseline('1.0.0', metrics);

    expect(filepath).toBeDefined();

    const loaded = await detector.loadBaseline('1.0.0');
    expect(loaded).toBeDefined();
    expect(loaded?.version).toBe('1.0.0');
    expect(loaded?.startup.total).toBe(1000);
  });

  it('should detect startup time regression', async () => {
    const baselineMetrics = createMockMetrics({
      version: '1.0.0',
      startup: { total: 1000, phases: [], suggestions: [] },
    });

    await detector.saveBaseline('1.0.0', baselineMetrics);

    const currentMetrics = createMockMetrics({
      version: '1.0.1',
      startup: { total: 1200, phases: [], suggestions: [] }, // 20% increase
    });

    const report = await detector.detectRegressions(currentMetrics, '1.0.0');

    expect(report.regressions.length).toBeGreaterThan(0);
    expect(report.regressions[0].metric).toBe('startup_time');
    expect(report.regressions[0].change).toBe(20);
    expect(report.regressions[0].severity).toBe('HIGH');
  });

  it('should detect tool latency regression', async () => {
    const baselineMetrics = createMockMetrics({
      tools: {
        stats: {
          git: {
            callCount: 10,
            avgTime: 100,
            minTime: 50,
            maxTime: 150,
            successRate: 100,
            lastCalled: Date.now(),
          },
        },
        frequent: [],
        slow: [],
      },
    });

    await detector.saveBaseline('1.0.0', baselineMetrics);

    const currentMetrics = createMockMetrics({
      tools: {
        stats: {
          git: {
            callCount: 10,
            avgTime: 150,
            minTime: 50,
            maxTime: 200,
            successRate: 100,
            lastCalled: Date.now(),
          },
        },
        frequent: [],
        slow: [],
      },
    });

    const report = await detector.detectRegressions(currentMetrics, '1.0.0');

    expect(report.regressions.length).toBe(1);
    expect(report.regressions[0].metric).toBe('tool_latency.git');
    expect(report.regressions[0].change).toBe(50);
  });

  it('should detect success rate regression', async () => {
    const baselineMetrics = createMockMetrics({
      tools: {
        stats: {
          git: {
            callCount: 10,
            avgTime: 100,
            minTime: 50,
            maxTime: 150,
            successRate: 98,
            lastCalled: Date.now(),
          },
        },
        frequent: [],
        slow: [],
      },
    });

    await detector.saveBaseline('1.0.0', baselineMetrics);

    const currentMetrics = createMockMetrics({
      tools: {
        stats: {
          git: {
            callCount: 10,
            avgTime: 100,
            minTime: 50,
            maxTime: 150,
            successRate: 90,
            lastCalled: Date.now(),
          },
        },
        frequent: [],
        slow: [],
      },
    });

    const report = await detector.detectRegressions(currentMetrics, '1.0.0');

    const successRegression = report.regressions.find((r) =>
      r.metric.includes('success_rate'),
    );

    expect(successRegression).toBeDefined();
    expect(successRegression?.change).toBe(8); // 98% -> 90% = 8% decrease
  });

  it('should detect improvements', async () => {
    const baselineMetrics = createMockMetrics({
      startup: { total: 1200, phases: [], suggestions: [] },
    });

    await detector.saveBaseline('1.0.0', baselineMetrics);

    const currentMetrics = createMockMetrics({
      startup: { total: 900, phases: [], suggestions: [] }, // 25% improvement
    });

    const report = await detector.detectRegressions(currentMetrics, '1.0.0');

    expect(report.improvements.length).toBeGreaterThan(0);
    expect(report.improvements[0].metric).toBe('startup_time');
    expect(report.improvements[0].change).toBe(25);
  });

  it('should pass CI check when no regressions', async () => {
    const baselineMetrics = createMockMetrics();
    await detector.saveBaseline('1.0.0', baselineMetrics);

    const report = await detector.runCICheck(baselineMetrics, {
      baselineVersion: '1.0.0',
      exitOnFailure: false,
    });

    expect(report.passed).toBe(true);
    expect(report.regressions.length).toBe(0);
  });
});
