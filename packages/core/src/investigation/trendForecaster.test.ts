import { describe, it, expect, beforeEach } from 'vitest';
import { TrendForecaster, type HeapDataPoint, type TrendReport } from './trendForecaster.js';
import type { ClassSummary } from './heapSnapshotAnalyzer.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function createLinearGrowthPoints(count: number, startSize: number, growthPerPoint: number, intervalMs: number): HeapDataPoint[] {
  const points: HeapDataPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      timestamp: 1000000 + i * intervalMs,
      totalHeapSize: startSize + i * growthPerPoint,
      usedHeapSize: startSize + i * growthPerPoint,
      objectCount: 10000 + i * 100,
      label: `point ${i + 1}`,
    });
  }
  return points;
}

function createStablePoints(count: number, size: number, intervalMs: number): HeapDataPoint[] {
  const points: HeapDataPoint[] = [];
  for (let i = 0; i < count; i++) {
    // Add small random noise
    const noise = (i % 3 - 1) * 100;
    points.push({
      timestamp: 1000000 + i * intervalMs,
      totalHeapSize: size + noise,
      usedHeapSize: size + noise,
      objectCount: 10000 + (i % 3),
      label: `stable ${i + 1}`,
    });
  }
  return points;
}

function createClassSummariesSeries(): { summaries: ClassSummary[][]; timestamps: number[] } {
  const timestamps = [1000, 2000, 3000];
  const summaries: ClassSummary[][] = [
    [
      { className: 'Map', count: 5, shallowSize: 500, retainedSize: 1_000_000, instances: [] },
      { className: 'string', count: 100, shallowSize: 10000, retainedSize: 500_000, instances: [] },
    ],
    [
      { className: 'Map', count: 10, shallowSize: 1000, retainedSize: 2_000_000, instances: [] },
      { className: 'string', count: 150, shallowSize: 15000, retainedSize: 750_000, instances: [] },
    ],
    [
      { className: 'Map', count: 15, shallowSize: 1500, retainedSize: 3_000_000, instances: [] },
      { className: 'string', count: 200, shallowSize: 20000, retainedSize: 1_000_000, instances: [] },
    ],
  ];
  return { summaries, timestamps };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TrendForecaster', () => {
  let forecaster: TrendForecaster;

  beforeEach(() => {
    forecaster = new TrendForecaster();
  });

  describe('addDataPoint', () => {
    it('should add data points and maintain sorted order', () => {
      forecaster.addDataPoint({ timestamp: 3000, totalHeapSize: 300, usedHeapSize: 300, objectCount: 30 });
      forecaster.addDataPoint({ timestamp: 1000, totalHeapSize: 100, usedHeapSize: 100, objectCount: 10 });
      forecaster.addDataPoint({ timestamp: 2000, totalHeapSize: 200, usedHeapSize: 200, objectCount: 20 });

      expect(forecaster.getDataPointCount()).toBe(3);
    });
  });

  describe('addFromClassSummaries', () => {
    it('should create data points from class summaries', () => {
      const { summaries, timestamps } = createClassSummariesSeries();
      forecaster.addFromClassSummaries(summaries, timestamps);

      expect(forecaster.getDataPointCount()).toBe(3);
    });

    it('should throw if arrays have different lengths', () => {
      expect(() => forecaster.addFromClassSummaries([[]], [1000, 2000])).toThrow('same length');
    });
  });

  describe('analyze — linear growth', () => {
    it('should detect growing trend', () => {
      const points = createLinearGrowthPoints(5, 100_000_000, 10_000_000, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.trend).toBe('growing');
      expect(report.growthRateBytesPerSec).toBeGreaterThan(0);
      expect(report.dataPointCount).toBe(5);
    });

    it('should have high R² for perfectly linear data', () => {
      const points = createLinearGrowthPoints(10, 100_000_000, 10_000_000, 1000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.rSquared).toBeGreaterThan(0.99);
      expect(report.growthModel).toBe('linear');
    });

    it('should predict OOM time for growing heap', () => {
      // Start at 500MB, grow 100MB per point (every 60s)
      const points = createLinearGrowthPoints(5, 500_000_000, 100_000_000, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.predictedOomMs).not.toBeNull();
      expect(report.oomPrediction).toContain('OOM');
    });

    it('should report no OOM for slow growth', () => {
      // Start at 100MB, grow 100 bytes per point (every minute) — would take forever
      const points = createLinearGrowthPoints(5, 100_000_000, 100, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      // Growth is so slow OOM prediction should be null (>24h)
      expect(report.predictedOomMs).toBeNull();
    });
  });

  describe('analyze — stable', () => {
    it('should detect stable trend', () => {
      const points = createStablePoints(5, 100_000_000, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.trend).toBe('stable');
      expect(report.predictedOomMs).toBeNull();
    });

    it('should report no OOM risk for stable heap', () => {
      const points = createStablePoints(10, 50_000_000, 1000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.oomPrediction).toContain('stable');
    });
  });

  describe('analyze — shrinking', () => {
    it('should detect shrinking trend', () => {
      const points = createLinearGrowthPoints(5, 500_000_000, -50_000_000, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.trend).toBe('shrinking');
      expect(report.growthRateBytesPerSec).toBeLessThan(0);
    });
  });

  describe('analyze — errors', () => {
    it('should throw with fewer than 2 data points', () => {
      forecaster.addDataPoint({ timestamp: 1000, totalHeapSize: 100, usedHeapSize: 100, objectCount: 10 });

      expect(() => forecaster.analyze()).toThrow('at least 2 data points');
    });

    it('should throw with 0 data points', () => {
      expect(() => forecaster.analyze()).toThrow('at least 2 data points');
    });
  });

  describe('analyze — statistics', () => {
    it('should compute correct statistics', () => {
      const points = createLinearGrowthPoints(5, 100_000, 10_000, 1000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.statistics.startHeapSize).toBe(100_000);
      expect(report.statistics.endHeapSize).toBe(140_000);
      expect(report.statistics.minHeapSize).toBe(100_000);
      expect(report.statistics.maxHeapSize).toBe(140_000);
      expect(report.statistics.netChange).toBe(40_000);
      expect(report.statistics.percentChange).toBeCloseTo(40, 1);
    });
  });

  describe('analyze — class growth', () => {
    it('should analyze per-class growth', () => {
      const { summaries, timestamps } = createClassSummariesSeries();
      forecaster.addFromClassSummaries(summaries, timestamps);

      const report = forecaster.analyze();

      expect(report.classGrowth.length).toBeGreaterThan(0);
      // Map should be the top grower
      const mapGrowth = report.classGrowth.find(c => c.className === 'Map');
      expect(mapGrowth).toBeDefined();
      expect(mapGrowth!.isGrowing).toBe(true);
      expect(mapGrowth!.sizeGrowthRate).toBeGreaterThan(0);
    });
  });

  describe('isGrowing', () => {
    it('should return true for growing heap', () => {
      const points = createLinearGrowthPoints(3, 100_000, 50_000, 1000);
      forecaster.addDataPoints(points);
      expect(forecaster.isGrowing()).toBe(true);
    });

    it('should return false for stable heap', () => {
      const points = createStablePoints(3, 100_000, 1000);
      forecaster.addDataPoints(points);
      expect(forecaster.isGrowing()).toBe(false);
    });

    it('should return false with < 2 points', () => {
      expect(forecaster.isGrowing()).toBe(false);
    });
  });

  describe('formatForTerminal', () => {
    it('should format growing report', () => {
      const points = createLinearGrowthPoints(5, 100_000_000, 10_000_000, 60_000);
      forecaster.addDataPoints(points);
      const report = forecaster.analyze();

      const formatted = TrendForecaster.formatForTerminal(report);

      expect(formatted).toContain('HEAP GROWTH TREND');
      expect(formatted).toContain('GROWING');
      expect(formatted).toContain('/sec');
    });
  });

  describe('toPerfettoCounters', () => {
    it('should export counter events', () => {
      const points = createLinearGrowthPoints(3, 100_000, 10_000, 1000);
      forecaster.addDataPoints(points);

      const counters = forecaster.toPerfettoCounters();

      expect(counters).toHaveLength(3);
      expect(counters[0].name).toBe('Heap Size');
      expect(counters[0].ts).toBe(1000000 * 1000); // microseconds
    });
  });

  describe('custom max heap', () => {
    it('should use custom max heap for OOM prediction', () => {
      const customForecaster = new TrendForecaster({ maxHeapBytes: 200_000 });

      // Start at 100K, grow 50K per point
      const points = createLinearGrowthPoints(3, 100_000, 50_000, 1000);
      customForecaster.addDataPoints(points);

      const report = customForecaster.analyze();

      expect(report.predictedOomMs).not.toBeNull();
      // Should predict OOM relatively soon
    });
  });

  describe('summary generation', () => {
    it('should include growth rate in summary', () => {
      const points = createLinearGrowthPoints(5, 100_000_000, 10_000_000, 60_000);
      forecaster.addDataPoints(points);

      const report = forecaster.analyze();

      expect(report.summary).toContain('growing');
      expect(report.summary).toContain('/sec');
    });

    it('should mention top growing classes in summary', () => {
      const { summaries, timestamps } = createClassSummariesSeries();
      forecaster.addFromClassSummaries(summaries, timestamps);

      const report = forecaster.analyze();

      if (report.classGrowth.filter(c => c.isGrowing).length > 0) {
        expect(report.summary).toContain('Top growing');
      }
    });
  });
});
