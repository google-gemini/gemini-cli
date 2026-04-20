/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { computePerfStats } from './computeStats.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    models: {
      'gemini-2.5-pro': {
        api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 5000 },
        tokens: {
          input: 1000,
          prompt: 1200,
          candidates: 500,
          total: 1700,
          cached: 200,
          thoughts: 0,
          tool: 0,
        },
        roles: {},
      },
    },
    tools: {
      totalCalls: 5,
      totalSuccess: 4,
      totalFail: 1,
      totalDurationMs: 2000,
      totalDecisions: {
        accept: 3,
        reject: 1,
        modify: 0,
        auto_accept: 1,
      },
      byName: {
        read_file: {
          count: 3,
          success: 3,
          fail: 0,
          durationMs: 1500,
          decisions: { accept: 2, reject: 0, modify: 0, auto_accept: 1 },
        },
        run_shell_command: {
          count: 2,
          success: 1,
          fail: 1,
          durationMs: 500,
          decisions: { accept: 1, reject: 1, modify: 0, auto_accept: 0 },
        },
      },
    },
    files: {
      totalLinesAdded: 50,
      totalLinesRemoved: 10,
    },
    ...overrides,
  };
}

describe('computePerfStats', () => {
  it('should compute idle time correctly', () => {
    const metrics = makeMetrics();
    const wallTimeMs = 20000; // 20 seconds
    const result = computePerfStats(metrics, wallTimeMs);

    // Agent active = API (5000) + Tool (2000) = 7000
    // Idle = 20000 - 7000 = 13000
    expect(result.idleTimeMs).toBe(13000);
  });

  it('should compute per-model stats', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 10000);

    expect(result.perModelStats).toHaveLength(1);
    expect(result.perModelStats[0]?.name).toBe('gemini-2.5-pro');
    expect(result.perModelStats[0]?.requests).toBe(10);
    expect(result.perModelStats[0]?.avgLatencyMs).toBe(500); // 5000/10
    expect(result.perModelStats[0]?.errorRate).toBe(10); // 1/10 * 100
  });

  it('should sort tools by duration (descending)', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 10000);

    expect(result.topToolsByDuration).toHaveLength(2);
    expect(result.topToolsByDuration[0]?.name).toBe('read_file');
    expect(result.topToolsByDuration[1]?.name).toBe('run_shell_command');
  });

  it('should compute average tool duration', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 10000);

    const readFile = result.topToolsByDuration[0];
    expect(readFile?.avgDurationMs).toBe(500); // 1500/3
  });

  it('should compute tokens per request', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 10000);

    // totalInputTokens = 1000, totalOutputTokens = 500, totalRequests = 10
    expect(result.tokensPerRequest).toBe(150);
  });

  it('should compute memory stats', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 10000);

    expect(result.memory.rss).toBeGreaterThan(0);
    expect(result.memory.heapUsed).toBeGreaterThan(0);
    expect(result.memory.heapTotal).toBeGreaterThan(0);
  });

  it('should handle zero wall time', () => {
    const metrics = makeMetrics();
    const result = computePerfStats(metrics, 0);

    expect(result.idleTimeMs).toBe(0);
  });

  it('should limit top tools to 5', () => {
    const tools: SessionMetrics['tools'] = {
      totalCalls: 12,
      totalSuccess: 12,
      totalFail: 0,
      totalDurationMs: 6000,
      totalDecisions: { accept: 12, reject: 0, modify: 0, auto_accept: 0 },
      byName: {},
    };

    for (let i = 0; i < 8; i++) {
      tools.byName[`tool_${i}`] = {
        count: 2,
        success: 2,
        fail: 0,
        durationMs: (i + 1) * 100,
        decisions: { accept: 2, reject: 0, modify: 0, auto_accept: 0 },
      };
    }

    const metrics = makeMetrics({ tools });
    const result = computePerfStats(metrics, 10000);

    expect(result.topToolsByDuration).toHaveLength(5);
    // Should be sorted by duration descending
    expect(result.topToolsByDuration[0]?.name).toBe('tool_7');
  });
});
