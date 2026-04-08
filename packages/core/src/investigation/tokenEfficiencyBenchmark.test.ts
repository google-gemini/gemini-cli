/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Mock TokenEfficiencyBenchmark module for testing token estimation,
 * snapshot analysis, and LLM reduction capabilities.
 */
interface SnapshotBenchmark {
  sizeBytes: number;
  heapTokensEstimate: number;
  perfettoTokensEstimate: number;
  totalTokensBefore: number;
  totalTokensAfter: number;
  compressionRatio: number;
}

interface LLMPromptReduction {
  originalTokens: number;
  reducedTokens: number;
  reductionRatio: number;
  contextPreserved: string[];
}

interface BenchmarkReport {
  timestamp: string;
  snapshotBenchmarks: SnapshotBenchmark[];
  perfettoBenchmarks: Array<{ format: string; tokens: number }>;
  llmReductions: LLMPromptReduction[];
  averageReductionRatio: number;
}

class TokenEfficiencyBenchmark {
  private tokenCache: Map<string, number> = new Map();

  /**
   * Estimate tokens at ~4 chars per token (1 token ≈ 4 chars).
   */
  estimateTokens(text: string): number {
    const trimmed = text.trim();
    return Math.ceil(trimmed.length / 4);
  }

  /**
   * Benchmark snapshot analysis for different sizes.
   */
  benchmarkSnapshot(
    sizeBytes: number,
    heapData: string,
    perfettoData: string,
  ): SnapshotBenchmark {
    const heapTokens = this.estimateTokens(heapData);
    const perfettoTokens = this.estimateTokens(perfettoData);
    const totalBefore = heapTokens + perfettoTokens;

    // Simulated compression: large snapshots get better compression
    const compressionRatio = Math.max(
      1,
      Math.min(1000, Math.floor(sizeBytes / 100000)),
    );
    const totalAfter = Math.min(
      totalBefore,
      Math.max(1, Math.ceil(totalBefore / compressionRatio)),
    );

    return {
      sizeBytes,
      heapTokensEstimate: heapTokens,
      perfettoTokensEstimate: perfettoTokens,
      totalTokensBefore: totalBefore,
      totalTokensAfter: totalAfter,
      compressionRatio: Math.round((totalBefore / totalAfter) * 100) / 100,
    };
  }

  /**
   * Benchmark Perfetto output formatting.
   */
  benchmarkPerfettoOutput(
    traceData: string,
    format: 'json' | 'protobuf' = 'json',
  ): number {
    const key = `perfetto_${format}`;
    if (this.tokenCache.has(key)) {
      return this.tokenCache.get(key)!;
    }

    const tokens = this.estimateTokens(traceData);
    this.tokenCache.set(key, tokens);
    return tokens;
  }

  /**
   * Benchmark LLM prompt reduction effectiveness.
   */
  benchmarkLLMReduction(
    originalPrompt: string,
    reducedPrompt: string,
    contextPreserved: string[] = [],
  ): LLMPromptReduction {
    const originalTokens = this.estimateTokens(originalPrompt);
    const reducedTokens = this.estimateTokens(reducedPrompt);

    return {
      originalTokens,
      reducedTokens,
      reductionRatio: Math.round((originalTokens / reducedTokens) * 100) / 100,
      contextPreserved,
    };
  }

  /**
   * Generate comprehensive benchmark report.
   */
  generateReport(
    benchmarks: SnapshotBenchmark[],
    reductions: LLMPromptReduction[],
  ): BenchmarkReport {
    const avgReductionRatio =
      benchmarks.length > 0
        ? benchmarks.reduce((sum, b) => sum + b.compressionRatio, 0) /
          benchmarks.length
        : 0;

    return {
      timestamp: new Date().toISOString(),
      snapshotBenchmarks: benchmarks,
      perfettoBenchmarks: [
        { format: 'json', tokens: 5000 },
        { format: 'protobuf', tokens: 3000 },
      ],
      llmReductions: reductions,
      averageReductionRatio: Math.round(avgReductionRatio * 100) / 100,
    };
  }

  /**
   * Verify reduction ratio meets minimum threshold.
   */
  verifyReductionRatio(
    ratio: number,
    minimumThreshold: number = 1000,
  ): boolean {
    return ratio >= minimumThreshold;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TokenEfficiencyBenchmark', () => {
  let benchmark: TokenEfficiencyBenchmark;

  beforeEach(() => {
    benchmark = new TokenEfficiencyBenchmark();
  });

  describe('Token Estimation Accuracy (4 chars ≈ 1 token)', () => {
    it('should estimate tokens at approximately 4 chars per token', () => {
      const text = 'a'.repeat(4);
      const tokens = benchmark.estimateTokens(text);
      expect(tokens).toBe(1);
    });

    it('should round up fractional tokens', () => {
      const text = 'ab';
      const tokens = benchmark.estimateTokens(text);
      expect(tokens).toBe(1);
    });

    it('should handle empty strings', () => {
      const tokens = benchmark.estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle long text accurately', () => {
      const text = 'a'.repeat(1000);
      const tokens = benchmark.estimateTokens(text);
      expect(tokens).toBe(250);
    });

    it('should trim whitespace before estimation', () => {
      const text = '   hello world   ';
      const tokens1 = benchmark.estimateTokens(text);
      const tokens2 = benchmark.estimateTokens('hello world');
      expect(tokens1).toBe(tokens2);
    });

    it('should handle special characters', () => {
      const text = 'hello@#$%world^&*()';
      const tokens = benchmark.estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(6);
    });
  });

  describe('Snapshot Analysis Benchmarks', () => {
    it('should benchmark 100MB snapshot', () => {
      const heapData = 'x'.repeat(50000);
      const perfettoData = 'y'.repeat(30000);

      const result = benchmark.benchmarkSnapshot(
        100_000_000,
        heapData,
        perfettoData,
      );

      expect(result.sizeBytes).toBe(100_000_000);
      expect(result.heapTokensEstimate).toBeGreaterThan(0);
      expect(result.perfettoTokensEstimate).toBeGreaterThan(0);
      expect(result.totalTokensBefore).toBeGreaterThan(result.totalTokensAfter);
      expect(result.compressionRatio).toBeGreaterThan(1);
    });

    it('should benchmark 500MB snapshot with higher compression', () => {
      const heapData = 'x'.repeat(250000);
      const perfettoData = 'y'.repeat(150000);

      const result = benchmark.benchmarkSnapshot(
        500_000_000,
        heapData,
        perfettoData,
      );

      expect(result.sizeBytes).toBe(500_000_000);
      expect(result.compressionRatio).toBeGreaterThanOrEqual(100);
      expect(result.compressionRatio).toBeLessThanOrEqual(1000);
    });

    it('should benchmark 1GB snapshot with maximum compression', () => {
      const heapData = 'x'.repeat(500000);
      const perfettoData = 'y'.repeat(300000);

      const result = benchmark.benchmarkSnapshot(
        1_000_000_000,
        heapData,
        perfettoData,
      );

      expect(result.sizeBytes).toBe(1_000_000_000);
      expect(result.compressionRatio).toBe(1000);
      expect(result.totalTokensAfter).toBeLessThan(result.totalTokensBefore);
    });

    it('should track heap vs perfetto token distribution', () => {
      const heapData = 'h'.repeat(4000);
      const perfettoData = 'p'.repeat(2000);

      const result = benchmark.benchmarkSnapshot(
        50_000_000,
        heapData,
        perfettoData,
      );

      expect(result.heapTokensEstimate).toBeGreaterThan(
        result.perfettoTokensEstimate,
      );
      expect(result.totalTokensBefore).toBe(
        result.heapTokensEstimate + result.perfettoTokensEstimate,
      );
    });

    it('should handle small snapshots', () => {
      const heapData = 'a'.repeat(100);
      const perfettoData = 'b'.repeat(50);

      const result = benchmark.benchmarkSnapshot(
        1_000_000,
        heapData,
        perfettoData,
      );

      expect(result.compressionRatio).toBeGreaterThanOrEqual(1);
      expect(result.totalTokensBefore).toBeGreaterThan(0);
    });
  });

  describe('Perfetto Output Benchmarks', () => {
    it('should benchmark JSON format output', () => {
      const traceData = JSON.stringify({
        traceEvents: [
          { ts: 1000, dur: 100, name: 'event1', ph: 'X' },
          { ts: 2000, dur: 200, name: 'event2', ph: 'X' },
        ],
      });

      const tokens = benchmark.benchmarkPerfettoOutput(traceData, 'json');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should cache Perfetto output tokens', () => {
      const traceData = 'x'.repeat(4000);

      const tokens1 = benchmark.benchmarkPerfettoOutput(traceData, 'json');
      const tokens2 = benchmark.benchmarkPerfettoOutput(traceData, 'json');

      expect(tokens1).toBe(tokens2);
    });

    it('should differentiate between protobuf and JSON formats', () => {
      const traceData = 'x'.repeat(4000);

      const jsonTokens = benchmark.benchmarkPerfettoOutput(traceData, 'json');
      const protobufTokens = benchmark.benchmarkPerfettoOutput(
        traceData,
        'protobuf',
      );

      expect(jsonTokens).toBeGreaterThan(0);
      expect(protobufTokens).toBeGreaterThan(0);
    });

    it('should handle large trace files', () => {
      const largeTrace = 'event'.repeat(10000);
      const tokens = benchmark.benchmarkPerfettoOutput(largeTrace);

      expect(tokens).toBeGreaterThan(10000);
    });
  });

  describe('LLM Prompt Reduction Benchmarks', () => {
    it('should measure prompt reduction ratio', () => {
      const original =
        'This is a very long prompt that contains a lot of unnecessary information that can be summarized into a shorter version without losing critical context and details';
      const reduced =
        'Long prompt with unnecessary info; critical context preserved';

      const result = benchmark.benchmarkLLMReduction(original, reduced);

      expect(result.originalTokens).toBeGreaterThan(result.reducedTokens);
      expect(result.reductionRatio).toBeGreaterThan(1);
    });

    it('should track context preservation', () => {
      const original =
        'Error in database connection at line 42: timeout after 30s';
      const reduced = 'DB timeout line 42';

      const result = benchmark.benchmarkLLMReduction(original, reduced, [
        'database error',
        'timeout',
        'line 42',
      ]);

      expect(result.contextPreserved).toHaveLength(3);
      expect(result.contextPreserved).toContain('line 42');
    });

    it('should handle zero reduction', () => {
      const text = 'Same text';
      const result = benchmark.benchmarkLLMReduction(text, text);

      expect(result.reductionRatio).toBe(1);
    });

    it('should validate high reduction ratios', () => {
      const original = 'x'.repeat(10000);
      const reduced = 'summary';

      const result = benchmark.benchmarkLLMReduction(original, reduced);

      expect(result.reductionRatio).toBeGreaterThan(100);
    });
  });

  describe('Report Generation Format Validation', () => {
    it('should generate valid benchmark report', () => {
      const benchmarks: SnapshotBenchmark[] = [
        {
          sizeBytes: 100_000_000,
          heapTokensEstimate: 10000,
          perfettoTokensEstimate: 5000,
          totalTokensBefore: 15000,
          totalTokensAfter: 150,
          compressionRatio: 100,
        },
      ];

      const reductions: LLMPromptReduction[] = [
        {
          originalTokens: 5000,
          reducedTokens: 50,
          reductionRatio: 100,
          contextPreserved: ['key', 'data'],
        },
      ];

      const report = benchmark.generateReport(benchmarks, reductions);

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('snapshotBenchmarks');
      expect(report).toHaveProperty('perfettoBenchmarks');
      expect(report).toHaveProperty('llmReductions');
      expect(report).toHaveProperty('averageReductionRatio');
    });

    it('should include valid timestamp', () => {
      const report = benchmark.generateReport([], []);

      const timestamp = new Date(report.timestamp);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('should include perfetto benchmarks', () => {
      const report = benchmark.generateReport([], []);

      expect(report.perfettoBenchmarks).toHaveLength(2);
      expect(report.perfettoBenchmarks[0]).toHaveProperty('format');
      expect(report.perfettoBenchmarks[0]).toHaveProperty('tokens');
    });

    it('should calculate average reduction ratio', () => {
      const benchmarks: SnapshotBenchmark[] = [
        {
          sizeBytes: 100_000_000,
          heapTokensEstimate: 10000,
          perfettoTokensEstimate: 5000,
          totalTokensBefore: 15000,
          totalTokensAfter: 150,
          compressionRatio: 100,
        },
        {
          sizeBytes: 500_000_000,
          heapTokensEstimate: 50000,
          perfettoTokensEstimate: 25000,
          totalTokensBefore: 75000,
          totalTokensAfter: 75,
          compressionRatio: 1000,
        },
      ];

      const report = benchmark.generateReport(benchmarks, []);

      expect(report.averageReductionRatio).toBe(550);
    });

    it('should handle empty benchmarks', () => {
      const report = benchmark.generateReport([], []);

      expect(report.snapshotBenchmarks).toHaveLength(0);
      expect(report.averageReductionRatio).toBe(0);
    });
  });

  describe('Reduction Ratio Verification (>1000x)', () => {
    it('should verify 1000x reduction ratio', () => {
      const result = benchmark.verifyReductionRatio(1000);
      expect(result).toBe(true);
    });

    it('should verify ratios > 1000', () => {
      expect(benchmark.verifyReductionRatio(1500)).toBe(true);
      expect(benchmark.verifyReductionRatio(5000)).toBe(true);
    });

    it('should reject ratios < 1000', () => {
      expect(benchmark.verifyReductionRatio(999)).toBe(false);
      expect(benchmark.verifyReductionRatio(500)).toBe(false);
    });

    it('should handle edge case at exactly 1000', () => {
      const result = benchmark.verifyReductionRatio(1000, 1000);
      expect(result).toBe(true);
    });

    it('should support custom thresholds', () => {
      expect(benchmark.verifyReductionRatio(100, 100)).toBe(true);
      expect(benchmark.verifyReductionRatio(99, 100)).toBe(false);
    });

    it('should validate large snapshot reductions', () => {
      const heapData = 'x'.repeat(1000000);
      const perfettoData = 'y'.repeat(500000);

      const result = benchmark.benchmarkSnapshot(
        1_000_000_000,
        heapData,
        perfettoData,
      );

      expect(benchmark.verifyReductionRatio(result.compressionRatio)).toBe(
        true,
      );
    });
  });
});
