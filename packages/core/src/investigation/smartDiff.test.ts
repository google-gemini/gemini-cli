import { describe, it, expect, beforeEach } from 'vitest';
import { SmartDiffEngine, type SmartDiffReport } from './smartDiff.js';
import type { ClassSummary } from './heapSnapshotAnalyzer.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function createSnap1Summaries(): ClassSummary[] {
  return [
    { className: 'Map', count: 5, shallowSize: 500, retainedSize: 1_000_000, instances: [1, 2, 3, 4, 5] },
    { className: 'string', count: 5000, shallowSize: 500_000, retainedSize: 2_000_000, instances: [] },
    { className: 'Array', count: 100, shallowSize: 50_000, retainedSize: 1_000_000, instances: [] },
    { className: 'Closure', count: 200, shallowSize: 9600, retainedSize: 500_000, instances: [] },
    { className: 'OldClass', count: 10, shallowSize: 1000, retainedSize: 200_000, instances: [] },
  ];
}

function createSnap2Summaries_Growth(): ClassSummary[] {
  return [
    { className: 'Map', count: 15, shallowSize: 1500, retainedSize: 5_000_000, instances: [] }, // grew 4MB
    { className: 'string', count: 8000, shallowSize: 800_000, retainedSize: 15_000_000, instances: [] }, // grew 13MB
    { className: 'Array', count: 150, shallowSize: 75_000, retainedSize: 1_500_000, instances: [] }, // grew 500KB
    { className: 'Closure', count: 500, shallowSize: 24_000, retainedSize: 2_000_000, instances: [] }, // grew 1.5MB
    // OldClass disappeared
    { className: 'NewWidget', count: 20, shallowSize: 2000, retainedSize: 300_000, instances: [] }, // new class
  ];
}

function createSnap2Summaries_Stable(): ClassSummary[] {
  return [
    { className: 'Map', count: 5, shallowSize: 500, retainedSize: 1_000_100, instances: [] }, // barely changed
    { className: 'string', count: 5010, shallowSize: 501_000, retainedSize: 2_001_000, instances: [] },
    { className: 'Array', count: 100, shallowSize: 50_000, retainedSize: 1_000_000, instances: [] },
    { className: 'Closure', count: 200, shallowSize: 9600, retainedSize: 500_000, instances: [] },
    { className: 'OldClass', count: 10, shallowSize: 1000, retainedSize: 200_000, instances: [] },
  ];
}

function createSnap2Summaries_Shrinkage(): ClassSummary[] {
  return [
    { className: 'Map', count: 2, shallowSize: 200, retainedSize: 200_000, instances: [] }, // shrunk
    { className: 'string', count: 2000, shallowSize: 200_000, retainedSize: 500_000, instances: [] }, // shrunk
    { className: 'Array', count: 50, shallowSize: 25_000, retainedSize: 300_000, instances: [] }, // shrunk
    { className: 'Closure', count: 100, shallowSize: 4800, retainedSize: 200_000, instances: [] }, // shrunk
    { className: 'OldClass', count: 10, shallowSize: 1000, retainedSize: 200_000, instances: [] },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SmartDiffEngine', () => {
  let engine: SmartDiffEngine;

  beforeEach(() => {
    engine = new SmartDiffEngine();
  });

  describe('diff — growth scenario', () => {
    it('should detect net memory growth', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.netMemoryChange).toBeGreaterThan(0);
      expect(report.percentChange).toBeGreaterThan(0);
    });

    it('should identify top growers', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.topGrowers.length).toBeGreaterThan(0);
      // string should be the top grower (13MB growth)
      expect(report.topGrowers[0].className).toBe('string');
      expect(report.topGrowers[0].retainedDelta).toBe(13_000_000);
    });

    it('should detect new classes', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.newClasses.length).toBe(1);
      expect(report.newClasses[0].className).toBe('NewWidget');
    });

    it('should detect disappeared classes', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.disappearedClasses.length).toBe(1);
      expect(report.disappearedClasses[0].className).toBe('OldClass');
    });

    it('should compute growth share percentages', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      const totalGrowthShare = report.topGrowers.reduce((s, g) => s + g.growthShare, 0);
      expect(totalGrowthShare).toBeCloseTo(100, 0);
    });

    it('should generate change stories', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.stories.length).toBeGreaterThan(0);
      // Should have a string accumulation story
      const stringStory = report.stories.find(s => s.involvedClasses.includes('string'));
      expect(stringStory).toBeDefined();
      expect(stringStory!.changeType).toBe('growth');
    });

    it('should generate growth attribution', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.attribution.length).toBeGreaterThan(0);
      // Attributions should be sorted by absolute bytes
      for (let i = 1; i < report.attribution.length; i++) {
        expect(Math.abs(report.attribution[i].bytes)).toBeLessThanOrEqual(Math.abs(report.attribution[i - 1].bytes));
      }
    });

    it('should include new class in stories', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      const newClassStory = report.stories.find(s => s.changeType === 'new_retention');
      expect(newClassStory).toBeDefined();
      expect(newClassStory!.involvedClasses).toContain('NewWidget');
    });
  });

  describe('diff — stable scenario', () => {
    it('should detect minimal change', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Stable());

      // Very small change
      expect(Math.abs(report.netMemoryChange)).toBeLessThan(100_000);
    });

    it('should have few or no change stories', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Stable());

      // No major growers means no stories about major growth
      const growthStories = report.stories.filter(s => s.changeType === 'growth');
      expect(growthStories.length).toBe(0);
    });

    it('should report healthy delta', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Stable());

      // Minimal change should not significantly impact health
      expect(Math.abs(report.healthDelta)).toBeLessThan(5);
    });
  });

  describe('diff — shrinkage scenario', () => {
    it('should detect net memory decrease', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());

      expect(report.netMemoryChange).toBeLessThan(0);
      expect(report.percentChange).toBeLessThan(0);
    });

    it('should identify shrinkers', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());

      expect(report.topShrinkers.length).toBeGreaterThan(0);
      // All classes shrunk except OldClass
      expect(report.topShrinkers.length).toBe(4);
    });

    it('should generate shrinkage story', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());

      const shrinkStory = report.stories.find(s => s.changeType === 'shrinkage');
      expect(shrinkStory).toBeDefined();
      expect(shrinkStory!.memoryImpact).toBeLessThan(0);
    });

    it('should report positive health delta', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());

      expect(report.healthDelta).toBeGreaterThan(0);
    });
  });

  describe('diff — edge cases', () => {
    it('should handle empty snap1', () => {
      const report = engine.diff([], createSnap1Summaries());

      expect(report.newClasses.length).toBe(createSnap1Summaries().length);
      expect(report.topGrowers.length).toBe(0);
    });

    it('should handle empty snap2', () => {
      const report = engine.diff(createSnap1Summaries(), []);

      expect(report.disappearedClasses.length).toBe(createSnap1Summaries().length);
      expect(report.netMemoryChange).toBeLessThan(0);
    });

    it('should handle both empty', () => {
      const report = engine.diff([], []);

      expect(report.netMemoryChange).toBe(0);
      expect(report.stories.length).toBe(0);
    });

    it('should include timeDeltaMs when provided', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth(), { timeDeltaMs: 60000 });

      expect(report.timeDeltaMs).toBe(60000);
    });
  });

  describe('diff — summary generation', () => {
    it('should generate meaningful summary for growth', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());

      expect(report.summary).toContain('grew');
      expect(report.summary.length).toBeGreaterThan(20);
    });

    it('should generate meaningful summary for shrinkage', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());

      expect(report.summary).toContain('decreased');
    });

    it('should generate meaningful summary for stability', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Stable());

      // Could mention stability or small growth
      expect(report.summary.length).toBeGreaterThan(10);
    });
  });

  describe('formatForTerminal', () => {
    it('should format growth report', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());
      const formatted = SmartDiffEngine.formatForTerminal(report);

      expect(formatted).toContain('SMART HEAP DIFF');
      expect(formatted).toContain('Net change');
      expect(formatted).toContain('What Changed');
      expect(formatted).toContain('\x1b['); // ANSI codes
    });

    it('should format shrinkage report', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Shrinkage());
      const formatted = SmartDiffEngine.formatForTerminal(report);

      expect(formatted).toContain('Memory Freed');
    });
  });

  describe('toMarkdown', () => {
    it('should generate markdown report', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());
      const markdown = SmartDiffEngine.toMarkdown(report);

      expect(markdown).toContain('# Heap Snapshot Diff Report');
      expect(markdown).toContain('Net memory change');
      expect(markdown).toContain('Change Stories');
      expect(markdown).toContain('Top Growers');
    });

    it('should include time delta when available', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth(), { timeDeltaMs: 120000 });
      const markdown = SmartDiffEngine.toMarkdown(report);

      expect(markdown).toContain('Time between snapshots');
    });

    it('should include attribution section', () => {
      const report = engine.diff(createSnap1Summaries(), createSnap2Summaries_Growth());
      const markdown = SmartDiffEngine.toMarkdown(report);

      expect(markdown).toContain('Growth Attribution');
    });
  });

  describe('story categorization', () => {
    it('should categorize string growth separately', () => {
      const snap1: ClassSummary[] = [
        { className: 'string', count: 100, shallowSize: 10000, retainedSize: 100_000, instances: [] },
        { className: 'concatenated string', count: 50, shallowSize: 5000, retainedSize: 50_000, instances: [] },
      ];
      const snap2: ClassSummary[] = [
        { className: 'string', count: 1000, shallowSize: 100_000, retainedSize: 5_000_000, instances: [] },
        { className: 'concatenated string', count: 500, shallowSize: 50_000, retainedSize: 2_000_000, instances: [] },
      ];

      const report = engine.diff(snap1, snap2);

      const stringStory = report.stories.find(s => s.title.toLowerCase().includes('string'));
      expect(stringStory).toBeDefined();
      expect(stringStory!.involvedClasses).toContain('string');
    });

    it('should categorize collection growth separately', () => {
      const snap1: ClassSummary[] = [
        { className: 'Map', count: 5, shallowSize: 500, retainedSize: 100_000, instances: [] },
        { className: 'Set', count: 3, shallowSize: 300, retainedSize: 50_000, instances: [] },
      ];
      const snap2: ClassSummary[] = [
        { className: 'Map', count: 50, shallowSize: 5_000, retainedSize: 5_000_000, instances: [] },
        { className: 'Set', count: 30, shallowSize: 3_000, retainedSize: 2_000_000, instances: [] },
      ];

      const report = engine.diff(snap1, snap2);

      const collectionStory = report.stories.find(s => s.title.toLowerCase().includes('collection'));
      expect(collectionStory).toBeDefined();
    });

    it('should categorize closure growth separately', () => {
      const snap1: ClassSummary[] = [
        { className: 'Closure', count: 100, shallowSize: 4800, retainedSize: 100_000, instances: [] },
      ];
      const snap2: ClassSummary[] = [
        { className: 'Closure', count: 1000, shallowSize: 48_000, retainedSize: 5_000_000, instances: [] },
      ];

      const report = engine.diff(snap1, snap2);

      const closureStory = report.stories.find(s => s.title.toLowerCase().includes('closure'));
      expect(closureStory).toBeDefined();
    });
  });
});
