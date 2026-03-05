/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceCollector } from './performanceCollector.js';

describe('PerformanceCollector', () => {
  let collector: PerformanceCollector;

  beforeEach(() => {
    collector = new PerformanceCollector();
  });

  describe('Latency Tracking', () => {
    it('should record and compute P50/P90/P99 for a single model', () => {
      for (let i = 1; i <= 100; i++) {
        collector.recordLatency('gemini-2.5-pro', i * 10);
      }
      const summary = collector.buildSummary({
        totalApiWaitMs: 5000,
        totalToolExecMs: 2000,
        totalInput: 1000,
        totalOutput: 500,
        totalCached: 200,
      });

      const model = summary.latencyByModel.find(
        (m) => m.model === 'gemini-2.5-pro',
      );
      expect(model).toBeDefined();
      expect(model!.p50).toBe(500);
      expect(model!.p90).toBe(900);
      expect(model!.p99).toBe(990);
      expect(model!.sampleCount).toBe(100);
    });

    it('should handle multiple models independently', () => {
      collector.recordLatency('model-a', 100);
      collector.recordLatency('model-b', 200);
      collector.recordLatency('model-a', 300);

      const summary = collector.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });

      expect(summary.latencyByModel.length).toBe(2);
    });

    it('should respect maxBufferSize', () => {
      const small = new PerformanceCollector(5);
      for (let i = 0; i < 10; i++) {
        small.recordLatency('test', i * 100);
      }
      const summary = small.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(
        summary.latencyByModel.find((m) => m.model === 'test')!.sampleCount,
      ).toBe(5);
    });
  });

  describe('Percentile Computation', () => {
    it('should return 0 for empty array', () => {
      expect(collector.computePercentile([], 50)).toBe(0);
    });

    it('should return the single value for a single-element array', () => {
      expect(collector.computePercentile([42], 50)).toBe(42);
      expect(collector.computePercentile([42], 99)).toBe(42);
    });

    it('should compute correct P50 for even-length array', () => {
      expect(collector.computePercentile([10, 20, 30, 40], 50)).toBe(20);
    });
  });

  describe('Token Efficiency', () => {
    it('should compute cache hit rate', () => {
      const eff = collector.computeTokenEfficiency({
        totalInput: 1000,
        totalOutput: 500,
        totalCached: 300,
      });
      expect(eff.cacheHitRate).toBeCloseTo(0.3);
    });

    it('should handle zero input gracefully', () => {
      const eff = collector.computeTokenEfficiency({
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(eff.cacheHitRate).toBe(0);
      expect(eff.outputEfficiency).toBe(0);
      expect(eff.contextUtilization).toBe(0);
    });

    it('should compute context utilization', () => {
      const eff = collector.computeTokenEfficiency({
        totalInput: 80000,
        totalOutput: 5000,
        totalCached: 10000,
        contextLimit: 100000,
      });
      expect(eff.contextUtilization).toBeCloseTo(0.8);
    });
  });

  describe('Memory Tracking', () => {
    it('should record memory snapshots', () => {
      collector.recordMemorySnapshot();
      collector.recordMemorySnapshot();
      const summary = collector.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(summary.memoryTrend.length).toBe(2);
      expect(summary.memoryTrend[0].heapUsedMB).toBeGreaterThan(0);
    });
  });

  describe('Startup Phases', () => {
    it('should record and compute phase percentages', () => {
      collector.recordStartupPhase('init', 100);
      collector.recordStartupPhase('auth', 200);
      collector.recordStartupPhase('model', 300);
      const summary = collector.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(summary.startupPhases.length).toBe(3);
      expect(summary.startupTotalMs).toBe(600);
      expect(summary.startupPhases[0].percentage).toBeCloseTo(16.67, 0);
      expect(summary.startupPhases[2].percentage).toBe(50);
    });
  });

  describe('Optimization Suggestions', () => {
    it('should warn about low cache hit rate', () => {
      const suggestions = collector.generateSuggestions({
        tokenEfficiency: {
          cacheHitRate: 0.1,
          outputEfficiency: 0.5,
          contextUtilization: 0.3,
          totalInput: 5000,
          totalOutput: 2000,
          totalCached: 500,
        },
      });
      expect(suggestions.some((s) => s.category === 'tokens')).toBe(true);
    });

    it('should warn about slow tools', () => {
      const suggestions = collector.generateSuggestions({
        tokenEfficiency: {
          cacheHitRate: 0.5,
          outputEfficiency: 0.5,
          contextUtilization: 0.3,
          totalInput: 0,
          totalOutput: 0,
          totalCached: 0,
        },
        toolStats: [{ name: 'read_file', avgDurationMs: 10000, failRate: 0 }],
      });
      expect(suggestions.some((s) => s.category === 'tools')).toBe(true);
    });

    it('should warn about high failure rate tools', () => {
      const suggestions = collector.generateSuggestions({
        tokenEfficiency: {
          cacheHitRate: 0.5,
          outputEfficiency: 0.5,
          contextUtilization: 0.3,
          totalInput: 0,
          totalOutput: 0,
          totalCached: 0,
        },
        toolStats: [{ name: 'run_cmd', avgDurationMs: 100, failRate: 0.5 }],
      });
      expect(suggestions.some((s) => s.message.includes('failure rate'))).toBe(
        true,
      );
    });

    it('should warn about critical memory pressure', () => {
      const suggestions = collector.generateSuggestions({
        tokenEfficiency: {
          cacheHitRate: 0.5,
          outputEfficiency: 0.5,
          contextUtilization: 0.3,
          totalInput: 0,
          totalOutput: 0,
          totalCached: 0,
        },
        heapUtilization: 0.9,
      });
      expect(suggestions.some((s) => s.severity === 'critical')).toBe(true);
    });
  });

  describe('Summary', () => {
    it('should build a complete summary from session metrics', () => {
      collector.recordLatency('gemini-2.5-flash', 200);
      collector.recordMemorySnapshot();
      collector.recordStartupPhase('init', 500);

      const summary = collector.buildSummary({
        totalApiWaitMs: 3000,
        totalToolExecMs: 1000,
        totalInput: 5000,
        totalOutput: 2000,
        totalCached: 1000,
      });

      expect(summary.sessionDurationMs).toBeGreaterThanOrEqual(0);
      expect(summary.apiWaitMs).toBe(3000);
      expect(summary.toolExecMs).toBe(1000);
      expect(summary.latencyByModel.length).toBe(1);
      expect(summary.memoryTrend.length).toBe(1);
      expect(summary.startupPhases.length).toBe(1);
      expect(summary.heapUtilization).toBeGreaterThan(0);
    });

    it('should handle empty metrics gracefully', () => {
      const summary = collector.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(summary.latencyByModel.length).toBe(0);
      expect(summary.suggestions.length).toBe(0);
    });
  });

  describe('Reset', () => {
    it('should clear all collected data', () => {
      collector.recordLatency('model', 100);
      collector.recordMemorySnapshot();
      collector.recordStartupPhase('init', 500);
      collector.reset();

      const summary = collector.buildSummary({
        totalApiWaitMs: 0,
        totalToolExecMs: 0,
        totalInput: 0,
        totalOutput: 0,
        totalCached: 0,
      });
      expect(summary.latencyByModel.length).toBe(0);
      expect(summary.memoryTrend.length).toBe(0);
      expect(summary.startupPhases.length).toBe(0);
    });
  });
});
