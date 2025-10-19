/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAverageLatency,
  calculateCacheHitRate,
  calculateErrorRate,
  computeSessionStats,
} from './computeStats.js';
import type {
  ModelMetrics,
  SessionMetrics,
} from '../contexts/SessionContext.js';

function createEmptyMetrics(): SessionMetrics {
  return {
    models: {},
    tools: {
      totalCalls: 0,
      totalSuccess: 0,
      totalFail: 0,
      totalDurationMs: 0,
      totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
      byName: {},
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };
}

describe('calculateErrorRate', () => {
  it('should return 0 if totalRequests is 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateErrorRate(metrics)).toBe(0);
  });

  it('should calculate the error rate correctly', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 10, totalErrors: 2, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateErrorRate(metrics)).toBe(20);
  });
});

describe('calculateAverageLatency', () => {
  it('should return 0 if totalRequests is 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 1000 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateAverageLatency(metrics)).toBe(0);
  });

  it('should calculate the average latency correctly', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 10, totalErrors: 0, totalLatencyMs: 1500 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 0,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateAverageLatency(metrics)).toBe(150);
  });
});

describe('calculateCacheHitRate', () => {
  it('should return 0 if prompt tokens is 0', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 0,
        candidates: 0,
        total: 0,
        cached: 100,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateCacheHitRate(metrics)).toBe(0);
  });

  it('should calculate the cache hit rate correctly', () => {
    const metrics: ModelMetrics = {
      api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
      tokens: {
        prompt: 200,
        candidates: 0,
        total: 0,
        cached: 50,
        thoughts: 0,
        tool: 0,
      },
    };
    expect(calculateCacheHitRate(metrics)).toBe(25);
  });
});

describe('computeSessionStats', () => {
  it('should return all zeros for initial empty metrics', () => {
    const metrics = createEmptyMetrics();

    const result = computeSessionStats(metrics);

    expect(result).toEqual({
      totalApiTime: 0,
      totalToolTime: 0,
      agentActiveTime: 0,
      apiTimePercent: 0,
      toolTimePercent: 0,
      cacheEfficiency: 0,
      totalDecisions: 0,
      successRate: 0,
      agreementRate: 0,
      totalPromptTokens: 0,
      totalCachedTokens: 0,
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    });
  });

  it('should correctly calculate API and tool time percentages', () => {
    const metrics: SessionMetrics = {
      ...createEmptyMetrics(),
      models: {
        'gemini-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 750 },
          tokens: {
            prompt: 10,
            candidates: 10,
            total: 20,
            cached: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        ...createEmptyMetrics().tools,
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 250,
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.totalApiTime).toBe(750);
    expect(result.totalToolTime).toBe(250);
    expect(result.agentActiveTime).toBe(1000);
    expect(result.apiTimePercent).toBe(75);
    expect(result.toolTimePercent).toBe(25);
  });

  it('should correctly calculate cache efficiency', () => {
    const metrics: SessionMetrics = {
      ...createEmptyMetrics(),
      models: {
        'gemini-pro': {
          api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 1000 },
          tokens: {
            prompt: 150,
            candidates: 10,
            total: 160,
            cached: 50,
            thoughts: 0,
            tool: 0,
          },
        },
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.cacheEfficiency).toBeCloseTo(33.33); // 50 / 150
  });

  it('should correctly calculate success and agreement rates', () => {
    const metrics: SessionMetrics = {
      ...createEmptyMetrics(),
      tools: {
        ...createEmptyMetrics().tools,
        totalCalls: 10,
        totalSuccess: 8,
        totalFail: 2,
        totalDurationMs: 1000,
        totalDecisions: {
          accept: 6,
          reject: 2,
          modify: 2,
          auto_accept: 0,
        },
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.successRate).toBe(80); // 8 / 10
    expect(result.agreementRate).toBe(60); // 6 / 10
  });

  it('should include auto_accept in agreement rate calculation', () => {
    const metrics: SessionMetrics = {
      ...createEmptyMetrics(),
      tools: {
        ...createEmptyMetrics().tools,
        totalDecisions: {
          accept: 5,
          reject: 2,
          modify: 3,
          auto_accept: 10,
        },
      },
    };

    const result = computeSessionStats(metrics);

    // Total decisions = 5 + 2 + 3 + 10 = 20
    // Agreement = (5 + 10) / 20 = 15 / 20 = 0.75 = 75%
    expect(result.totalDecisions).toBe(20);
    expect(result.agreementRate).toBe(75);
  });

  it('should handle division by zero gracefully', () => {
    const metrics = createEmptyMetrics();

    const result = computeSessionStats(metrics);

    expect(result.apiTimePercent).toBe(0);
    expect(result.toolTimePercent).toBe(0);
    expect(result.cacheEfficiency).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.agreementRate).toBe(0);
  });

  it('should correctly include line counts', () => {
    const metrics: SessionMetrics = {
      ...createEmptyMetrics(),
      files: {
        totalLinesAdded: 42,
        totalLinesRemoved: 18,
      },
    };

    const result = computeSessionStats(metrics);

    expect(result.totalLinesAdded).toBe(42);
    expect(result.totalLinesRemoved).toBe(18);
  });
});
