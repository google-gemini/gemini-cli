/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { exportToJSON, exportToMarkdown } from './performanceExporter.js';
import type { PerformanceSummary } from './performanceCollector.js';

function makeSummary(
  overrides?: Partial<PerformanceSummary>,
): PerformanceSummary {
  return {
    sessionDurationMs: 60000,
    apiWaitMs: 30000,
    toolExecMs: 10000,
    latencyByModel: [
      {
        model: 'gemini-2.5-pro',
        p50: 200,
        p90: 500,
        p99: 1200,
        sampleCount: 50,
      },
    ],
    tokenEfficiency: {
      cacheHitRate: 0.35,
      outputEfficiency: 0.4,
      contextUtilization: 0.6,
      totalInput: 10000,
      totalOutput: 5000,
      totalCached: 3500,
    },
    memoryTrend: [
      { timestamp: Date.now(), heapUsedMB: 120, heapTotalMB: 200, rssMB: 250 },
    ],
    memoryPeakMB: 150,
    memoryCurrentMB: 120,
    heapUtilization: 0.45,
    startupPhases: [
      { name: 'init', durationMs: 200, percentage: 40 },
      { name: 'auth', durationMs: 300, percentage: 60 },
    ],
    startupTotalMs: 500,
    suggestions: [
      {
        severity: 'warning',
        category: 'tokens',
        message: 'Low cache hit rate',
      },
    ],
    ...overrides,
  };
}

describe('Performance Exporter', () => {
  describe('exportToJSON', () => {
    it('should produce valid JSON', () => {
      const json = exportToJSON(makeSummary());
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all sections by default', () => {
      const parsed = JSON.parse(exportToJSON(makeSummary()));
      expect(parsed.latencyByModel).toBeDefined();
      expect(parsed.tokenEfficiency).toBeDefined();
      expect(parsed.memory).toBeDefined();
      expect(parsed.startup).toBeDefined();
      expect(parsed.suggestions).toBeDefined();
    });

    it('should exclude sections when disabled', () => {
      const parsed = JSON.parse(
        exportToJSON(makeSummary(), {
          includeLatency: false,
          includeMemory: false,
        }),
      );
      expect(parsed.latencyByModel).toBeUndefined();
      expect(parsed.memory).toBeUndefined();
      expect(parsed.tokenEfficiency).toBeDefined();
    });

    it('should include session duration', () => {
      const parsed = JSON.parse(exportToJSON(makeSummary()));
      expect(parsed.sessionDurationMs).toBe(60000);
    });

    it('should include export timestamp', () => {
      const parsed = JSON.parse(exportToJSON(makeSummary()));
      expect(parsed.exportedAt).toBeDefined();
    });
  });

  describe('exportToMarkdown', () => {
    it('should produce markdown with headers', () => {
      const md = exportToMarkdown(makeSummary());
      expect(md).toContain('# Performance Report');
      expect(md).toContain('## Latency by Model');
      expect(md).toContain('## Token Efficiency');
      expect(md).toContain('## Memory');
      expect(md).toContain('## Startup');
      expect(md).toContain('## Suggestions');
    });

    it('should format durations correctly', () => {
      const md = exportToMarkdown(makeSummary({ apiWaitMs: 30000 }));
      expect(md).toContain('30.0s');
    });

    it('should include model latency table', () => {
      const md = exportToMarkdown(makeSummary());
      expect(md).toContain('gemini-2.5-pro');
      expect(md).toContain('| Model |');
    });

    it('should include suggestion icons', () => {
      const md = exportToMarkdown(makeSummary());
      expect(md).toContain('🟡');
    });

    it('should exclude sections when disabled', () => {
      const md = exportToMarkdown(makeSummary(), {
        includeLatency: false,
        includeSuggestions: false,
      });
      expect(md).not.toContain('## Latency by Model');
      expect(md).not.toContain('## Suggestions');
    });

    it('should handle empty data gracefully', () => {
      const md = exportToMarkdown(
        makeSummary({
          latencyByModel: [],
          startupPhases: [],
          suggestions: [],
        }),
      );
      expect(md).toContain('# Performance Report');
      expect(md).not.toContain('## Latency by Model');
    });
  });
});
