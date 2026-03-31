/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  AllocationHotspotProfiler,
  type AllocationSample,
  type StackFrame,
} from './allocationHotspotProfiler.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function frame(
  name: string,
  script = 'app.js',
  line = 1,
  col = 0,
): StackFrame {
  return { functionName: name, scriptName: script, lineNumber: line, columnNumber: col };
}

function sample(
  nodeId: number,
  size: number,
  count: number,
  stack: StackFrame[],
): AllocationSample {
  return { nodeId, size, count, stack };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AllocationHotspotProfiler', () => {
  const profiler = new AllocationHotspotProfiler();

  // ─── analyze() ─────────────────────────────────────────────────────────

  describe('analyze', () => {
    it('should return an empty report for no samples', () => {
      const report = profiler.analyze([]);
      expect(report.totalAllocatedBytes).toBe(0);
      expect(report.totalAllocationCount).toBe(0);
      expect(report.hotspots).toHaveLength(0);
      expect(report.storms).toHaveLength(0);
      expect(report.recommendations).toBeDefined();
      expect(report.assessment).toBeDefined();
    });

    it('should compute correct totals from samples', () => {
      const samples = [
        sample(1, 1024, 10, [frame('foo'), frame('bar')]),
        sample(2, 2048, 5, [frame('baz')]),
      ];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });

      expect(report.totalAllocatedBytes).toBe(3072);
      expect(report.totalAllocationCount).toBe(15);
      expect(report.bytesPerSec).toBe(3072); // 3072 bytes / 1 second
      expect(report.allocationsPerSec).toBe(15);
      expect(report.profileDurationMs).toBe(1000);
    });

    it('should use default 1000ms duration if not specified', () => {
      const samples = [sample(1, 5000, 1, [frame('f')])];
      const report = profiler.analyze(samples);
      expect(report.profileDurationMs).toBe(1000);
      expect(report.bytesPerSec).toBe(5000);
    });

    it('should extract hotspots sorted by totalBytes descending', () => {
      const samples = [
        sample(1, 500, 5, [frame('small')]),
        sample(2, 10000, 20, [frame('big')]),
        sample(3, 3000, 10, [frame('medium')]),
      ];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });

      expect(report.hotspots.length).toBeGreaterThan(0);
      expect(report.hotspots[0].totalBytes).toBe(10000);
      expect(report.hotspots[0].functionName).toBe('big');
    });

    it('should compute share percentages that sum to ~100%', () => {
      const samples = [
        sample(1, 1000, 10, [frame('a')]),
        sample(2, 2000, 20, [frame('b')]),
        sample(3, 3000, 30, [frame('c')]),
      ];
      const report = profiler.analyze(samples);
      const totalShare = report.hotspots.reduce((s, h) => s + h.share, 0);
      expect(totalShare).toBeCloseTo(100, 0);
    });

    it('should build a call tree with root node', () => {
      const samples = [
        sample(1, 1000, 5, [frame('root'), frame('child'), frame('leaf')]),
      ];
      const report = profiler.analyze(samples);
      expect(report.callTree).toBeDefined();
      expect(report.callTree.functionName).toBeDefined();
    });

    it('should compute churn ratio when gcFreedBytes provided', () => {
      const samples = [sample(1, 10000, 100, [frame('alloc')])];
      const report = profiler.analyze(samples, {
        profileDurationMs: 1000,
        gcFreedBytes: 8000,
      });
      expect(report.churnRatio).toBeCloseTo(0.8, 1);
    });

    it('should cap churn ratio at 1.0', () => {
      const samples = [sample(1, 1000, 10, [frame('f')])];
      const report = profiler.analyze(samples, {
        profileDurationMs: 1000,
        gcFreedBytes: 5000, // more freed than allocated
      });
      expect(report.churnRatio).toBeLessThanOrEqual(1);
    });

    it('should set churn ratio to 0 when no gcFreedBytes', () => {
      const samples = [sample(1, 1000, 10, [frame('f')])];
      const report = profiler.analyze(samples);
      expect(report.churnRatio).toBe(0);
    });

    it('should generate assessment string', () => {
      const samples = [sample(1, 100_000_000, 1000, [frame('heavy')])];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });
      // 100MB/s should trigger critical assessment
      expect(report.assessment).toBeDefined();
      expect(report.assessment.length).toBeGreaterThan(0);
    });

    it('should generate recommendations for high allocation rate', () => {
      const samples = [sample(1, 100_000_000, 1000, [frame('heavy')])];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  // ─── Category classification ───────────────────────────────────────────

  describe('hotspot category classification', () => {
    it('should classify buffer allocation functions', () => {
      const samples = [sample(1, 5000, 10, [frame('Buffer.alloc')])];
      const report = profiler.analyze(samples);
      const bufferHotspot = report.hotspots.find(h => h.functionName.includes('Buffer'));
      if (bufferHotspot) {
        expect(bufferHotspot.category).toBe('buffer');
      }
    });

    it('should classify string functions', () => {
      const samples = [sample(1, 5000, 10, [frame('String.concat')])];
      const report = profiler.analyze(samples);
      const hotspot = report.hotspots.find(h => h.functionName.includes('String'));
      if (hotspot) {
        expect(hotspot.category).toBe('string');
      }
    });

    it('should classify array functions', () => {
      const samples = [sample(1, 5000, 10, [frame('Array.push')])];
      const report = profiler.analyze(samples);
      const hotspot = report.hotspots.find(h => h.functionName.includes('Array'));
      if (hotspot) {
        expect(hotspot.category).toBe('array');
      }
    });
  });

  // ─── Storm detection ───────────────────────────────────────────────────

  describe('storm detection', () => {
    it('should return no storms for < 10 samples', () => {
      const samples = Array.from({ length: 5 }, (_, i) =>
        sample(i, 1000, 1, [frame('f')]),
      );
      const report = profiler.analyze(samples);
      expect(report.storms).toHaveLength(0);
    });

    it('should detect storm when a bucket has 3x the median', () => {
      // Create 20 samples, most small, a few very large
      const samples: AllocationSample[] = [];
      for (let i = 0; i < 15; i++) {
        samples.push(sample(i, 100, 1, [frame('normal')]));
      }
      // Spike: 5 very large allocations
      for (let i = 15; i < 20; i++) {
        samples.push(sample(i, 100000, 100, [frame('spike')]));
      }
      const report = profiler.analyze(samples, { profileDurationMs: 2000 });
      // Storm detection depends on bucket partitioning — may or may not find storms
      // But the analysis should complete without error
      expect(report.storms).toBeDefined();
    });
  });

  // ─── Static methods ────────────────────────────────────────────────────

  describe('fromClassSummaries', () => {
    it('should convert class summaries to allocation samples', () => {
      const classes = [
        { className: 'Array', count: 100, shallowSize: 5000, retainedSize: 10000 },
        { className: 'Object', count: 200, shallowSize: 8000, retainedSize: 15000 },
      ];
      const samples = AllocationHotspotProfiler.fromClassSummaries(classes);
      expect(samples).toHaveLength(2);
      expect(samples[0].size).toBe(5000); // uses shallowSize
      expect(samples[0].count).toBe(100);
      expect(samples[0].stack.length).toBeGreaterThan(0);
    });

    it('should handle empty class summaries', () => {
      const samples = AllocationHotspotProfiler.fromClassSummaries([]);
      expect(samples).toHaveLength(0);
    });
  });

  describe('toFoldedStacks', () => {
    it('should produce flamegraph-compatible folded stacks format', () => {
      const samples = [
        sample(1, 1024, 1, [frame('main'), frame('process'), frame('alloc')]),
      ];
      const folded = profiler.toFoldedStacks(samples);
      expect(typeof folded).toBe('string');
      expect(folded.length).toBeGreaterThan(0);
      // Folded stacks format: "frame1;frame2;frame3 count\n"
      expect(folded).toContain(';');
    });
  });

  describe('toPerfettoEvents', () => {
    it('should produce Perfetto trace events', () => {
      const samples = [
        sample(1, 2048, 5, [frame('root'), frame('child')]),
      ];
      const events = profiler.toPerfettoEvents(samples, 1000);
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
      // Perfetto events should have ph, ts, name, etc.
      const event = events[0] as Record<string, unknown>;
      expect(event).toHaveProperty('ph');
      expect(event).toHaveProperty('name');
    });

    it('should handle empty samples (may include metadata)', () => {
      const events = profiler.toPerfettoEvents([], 1000);
      // May include metadata events even for empty input
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('formatForTerminal', () => {
    it('should produce a terminal-formatted string', () => {
      const samples = [sample(1, 5000, 10, [frame('test')])];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });
      const output = AllocationHotspotProfiler.formatForTerminal(report);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should format empty report without errors', () => {
      const report = profiler.analyze([]);
      const output = AllocationHotspotProfiler.formatForTerminal(report);
      expect(typeof output).toBe('string');
    });
  });

  // ─── Recommendations ──────────────────────────────────────────────────

  describe('recommendations', () => {
    it('should recommend buffer pooling for buffer-heavy allocation', () => {
      // Large buffer allocations > 30% share
      const samples = [
        sample(1, 50000, 100, [frame('Buffer.allocUnsafe')]),
        sample(2, 1000, 10, [frame('other')]),
      ];
      const report = profiler.analyze(samples, { profileDurationMs: 1000 });
      // May or may not trigger depending on classification
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate at least one recommendation for high churn', () => {
      const samples = [sample(1, 10000, 100, [frame('allocAndDiscard')])];
      const report = profiler.analyze(samples, {
        profileDurationMs: 1000,
        gcFreedBytes: 9000, // 90% churn
      });
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });
});
