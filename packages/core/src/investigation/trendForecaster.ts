/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * @module investigation/trendForecaster
 */

import type { ClassSummary } from './heapSnapshotAnalyzer.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A data point in the heap growth time series */
export interface HeapDataPoint {
  /** Timestamp in milliseconds */
  timestamp: number;

  /** Total heap size in bytes */
  totalHeapSize: number;

  /** Used heap size in bytes */
  usedHeapSize: number;

  /** Number of objects on the heap */
  objectCount: number;

  /** Per-class breakdown (optional, from snapshot analysis) */
  classSummaries?: ClassSummary[];

  /** Label for this data point (e.g., "snapshot 1", "after API call") */
  label?: string;
}

/** Result of trend analysis */
export interface TrendReport {
  /** When this analysis was generated */
  timestamp: string;

  /** Number of data points analyzed */
  dataPointCount: number;

  /** Time span covered (ms) */
  timeSpanMs: number;

  /** Overall trend direction */
  trend: 'growing' | 'stable' | 'shrinking';

  /** Growth rate in bytes per second */
  growthRateBytesPerSec: number;

  /** Growth rate in objects per second */
  growthRateObjectsPerSec: number;

  /** R² value of the linear fit (0-1, higher = more confident) */
  rSquared: number;

  /** Predicted time to OOM (null if not growing or would take >24h) */
  predictedOomMs: number | null;

  /** Human-readable OOM prediction */
  oomPrediction: string;

  /** Per-class growth analysis (top growers) */
  classGrowth: ClassGrowthEntry[];

  /** Statistical summary */
  statistics: TrendStatistics;

  /** Whether the growth appears to be linear or exponential */
  growthModel: 'linear' | 'exponential' | 'stable' | 'erratic';

  /** Human-readable summary */
  summary: string;
}

/** Growth analysis for a single class */
export interface ClassGrowthEntry {
  className: string;

  /** Count at each data point */
  countSeries: number[];

  /** Size at each data point */
  sizeSeries: number[];

  /** Growth rate (instances per second) */
  instanceGrowthRate: number;

  /** Growth rate (bytes per second) */
  sizeGrowthRate: number;

  /** Is this class consistently growing? */
  isGrowing: boolean;

  /** Percentage of total growth attributable to this class */
  growthShare: number;
}

/** Statistical summary of the trend */
export interface TrendStatistics {
  /** Minimum heap size observed */
  minHeapSize: number;

  /** Maximum heap size observed */
  maxHeapSize: number;

  /** Mean heap size */
  meanHeapSize: number;

  /** Standard deviation of heap size */
  stdDevHeapSize: number;

  /** Heap size at the start */
  startHeapSize: number;

  /** Heap size at the end */
  endHeapSize: number;

  /** Net change in bytes */
  netChange: number;

  /** Percentage change */
  percentChange: number;
}

/** Regression result */
interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

// ─── Forecaster ──────────────────────────────────────────────────────────────

export class TrendForecaster {
  private dataPoints: HeapDataPoint[] = [];

  /** Maximum heap size for OOM estimation (default: 1.5GB for Node.js) */
  private maxHeapBytes: number;

  constructor(options?: { maxHeapBytes?: number }) {
    this.maxHeapBytes = options?.maxHeapBytes ?? 1_500_000_000; // 1.5 GB default
  }

  /**
   * Add a data point to the time series.
   * Accepts common aliases: heapUsed → usedHeapSize, heapTotal → totalHeapSize
   * (matches process.memoryUsage() field names).
   */
  addDataPoint(point: HeapDataPoint): void {
    // Normalize common aliases from process.memoryUsage()
    const p: unknown = point;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const pRec = p as Record<string, unknown>;
    const heapUsedVal = Number(pRec['heapUsed'] ?? 0);
    const heapTotalVal = Number(pRec['heapTotal'] ?? 0);
    const normalized: HeapDataPoint = {
      timestamp: point.timestamp,
      usedHeapSize: point.usedHeapSize ?? heapUsedVal,
      totalHeapSize: point.totalHeapSize ?? heapTotalVal,
      objectCount: point.objectCount ?? 0,
      classSummaries: point.classSummaries,
      label: point.label,
    };
    this.dataPoints.push(normalized);
    // Keep sorted by timestamp
    this.dataPoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Add multiple data points at once.
   */
  addDataPoints(points: HeapDataPoint[]): void {
    for (const point of points) {
      this.addDataPoint(point);
    }
  }

  /**
   * Create data points from a series of class summaries taken at known times.
   */
  addFromClassSummaries(
    summaries: ClassSummary[][],
    timestamps: number[],
  ): void {
    if (summaries.length !== timestamps.length) {
      throw new Error(
        'summaries and timestamps arrays must have the same length',
      );
    }

    for (let i = 0; i < summaries.length; i++) {
      const totalSize = summaries[i].reduce(
        (sum, c) => sum + c.retainedSize,
        0,
      );
      const totalCount = summaries[i].reduce((sum, c) => sum + c.count, 0);

      this.addDataPoint({
        timestamp: timestamps[i],
        totalHeapSize: totalSize,
        usedHeapSize: totalSize,
        objectCount: totalCount,
        classSummaries: summaries[i],
        label: `snapshot ${i + 1}`,
      });
    }
  }

  /**
   * Get the current number of data points.
   */
  getDataPointCount(): number {
    return this.dataPoints.length;
  }

  /**
   * Run the full trend analysis.
   * Requires at least 2 data points.
   */
  analyze(): TrendReport {
    if (this.dataPoints.length < 2) {
      throw new Error(
        'Need at least 2 data points for trend analysis. ' +
          `Currently have ${this.dataPoints.length}.`,
      );
    }

    const timestamps = this.dataPoints.map((p) => p.timestamp);
    const heapSizes = this.dataPoints.map((p) => p.usedHeapSize);
    const objectCounts = this.dataPoints.map((p) => p.objectCount);
    const timeSpanMs = timestamps[timestamps.length - 1] - timestamps[0];

    // Linear regression on heap size over time
    const regression = linearRegression(timestamps, heapSizes);

    // Growth rate (bytes per millisecond → bytes per second)
    const growthRateBytesPerSec = regression.slope * 1000;
    const growthRateObjectsPerSec = this.computeObjectGrowthRate(
      timestamps,
      objectCounts,
    );

    // Determine trend
    let trend: 'growing' | 'stable' | 'shrinking';
    if (growthRateBytesPerSec > 100) {
      // > 100 bytes/sec growth
      trend = 'growing';
    } else if (growthRateBytesPerSec < -100) {
      trend = 'shrinking';
    } else {
      trend = 'stable';
    }

    // Determine growth model
    const growthModel = this.classifyGrowthModel(
      timestamps,
      heapSizes,
      regression.rSquared,
    );

    // Predict OOM
    const oomResult = this.predictOom(
      regression,
      timestamps[timestamps.length - 1],
      heapSizes[heapSizes.length - 1],
    );

    // Statistics
    const statistics = this.computeStatistics(heapSizes);

    // Per-class growth analysis
    const classGrowth = this.analyzeClassGrowth();

    // Summary
    const summary = this.generateSummary(
      trend,
      growthRateBytesPerSec,
      oomResult,
      statistics,
      classGrowth,
    );

    return {
      timestamp: new Date().toISOString(),
      dataPointCount: this.dataPoints.length,
      timeSpanMs,
      trend,
      growthRateBytesPerSec,
      growthRateObjectsPerSec,
      rSquared: regression.rSquared,
      predictedOomMs: oomResult.predictedMs,
      oomPrediction: oomResult.description,
      classGrowth,
      statistics,
      growthModel,
      summary,
    };
  }

  /**
   * Quick check: is memory growing?
   */
  isGrowing(): boolean {
    if (this.dataPoints.length < 2) return false;
    const first = this.dataPoints[0].usedHeapSize;
    const last = this.dataPoints[this.dataPoints.length - 1].usedHeapSize;
    return last > first * 1.05; // 5% growth threshold
  }

  /**
   * Format the trend report for terminal display.
   */
  static formatForTerminal(report: TrendReport): string {
    const lines: string[] = [];
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const dim = '\x1b[2m';
    const red = '\x1b[31m';
    const yellow = '\x1b[33m';
    const green = '\x1b[32m';
    const cyan = '\x1b[36m';

    const trendColor =
      report.trend === 'growing'
        ? red
        : report.trend === 'shrinking'
          ? green
          : cyan;

    lines.push(
      `${bold}╔══════════════════════════════════════════════════════════════════╗${reset}`,
    );
    lines.push(
      `${bold}║  HEAP GROWTH TREND ANALYSIS                                    ║${reset}`,
    );
    lines.push(
      `${bold}╚══════════════════════════════════════════════════════════════════╝${reset}`,
    );
    lines.push('');
    lines.push(
      `${bold}Trend:${reset}        ${trendColor}${report.trend.toUpperCase()}${reset} (${report.growthModel} model, R²=${report.rSquared.toFixed(3)})`,
    );
    lines.push(
      `${bold}Growth rate:${reset}  ${formatBytes(Math.abs(report.growthRateBytesPerSec))}/sec (${report.growthRateObjectsPerSec.toFixed(1)} objects/sec)`,
    );
    lines.push(
      `${bold}Time span:${reset}    ${formatDuration(report.timeSpanMs)}`,
    );
    lines.push(`${bold}Data points:${reset}  ${report.dataPointCount}`);
    lines.push('');

    // OOM prediction
    if (report.predictedOomMs !== null) {
      lines.push(
        `${bold}${red}⚠ OOM Prediction:${reset} ${report.oomPrediction}`,
      );
    } else if (report.trend === 'growing') {
      lines.push(
        `${bold}${yellow}OOM Prediction:${reset} ${report.oomPrediction}`,
      );
    } else {
      lines.push(`${bold}${green}OOM Risk:${reset} ${report.oomPrediction}`);
    }
    lines.push('');

    // Sparkline-style heap size visualization
    lines.push(`${bold}Heap size over time:${reset}`);
    lines.push(
      generateSparkline(
        report.statistics.minHeapSize,
        report.statistics.maxHeapSize,
        // Use start and end sizes for a simple 2-point visualization
        [report.statistics.startHeapSize, report.statistics.endHeapSize],
      ),
    );
    lines.push(
      `  ${dim}${formatBytes(report.statistics.startHeapSize)} → ${formatBytes(report.statistics.endHeapSize)} (${report.statistics.percentChange > 0 ? '+' : ''}${report.statistics.percentChange.toFixed(1)}%)${reset}`,
    );
    lines.push('');

    // Top growing classes
    const growers = report.classGrowth.filter((c) => c.isGrowing).slice(0, 5);
    if (growers.length > 0) {
      lines.push(`${bold}━━━ Top Growing Classes ━━━${reset}`);
      lines.push('');
      lines.push(
        `  ${'Class'.padEnd(25)} ${'Growth Rate'.padStart(15)} ${'Share'.padStart(8)}`,
      );
      lines.push(`  ${'─'.repeat(25)} ${'─'.repeat(15)} ${'─'.repeat(8)}`);
      for (const cls of growers) {
        const name = cls.className.slice(0, 24).padEnd(25);
        const rate = `${formatBytes(cls.sizeGrowthRate)}/s`.padStart(15);
        const share = `${cls.growthShare.toFixed(1)}%`.padStart(8);
        lines.push(`  ${name} ${rate} ${share}`);
      }
    }

    lines.push('');
    lines.push(`${dim}${report.summary}${reset}`);

    return lines.join('\n');
  }

  /**
   * Export trend data for Perfetto visualization (as counter track).
   */
  toPerfettoCounters(): Array<{ name: string; ts: number; value: number }> {
    return this.dataPoints.map((dp) => ({
      name: 'Heap Size',
      ts: dp.timestamp * 1000, // Perfetto uses microseconds
      value: dp.usedHeapSize,
    }));
  }

  // ─── Private Methods ──────────────────────────────────────────────────

  private computeObjectGrowthRate(
    timestamps: number[],
    counts: number[],
  ): number {
    if (timestamps.length < 2) return 0;
    const regression = linearRegression(timestamps, counts);
    return regression.slope * 1000; // per second
  }

  private classifyGrowthModel(
    timestamps: number[],
    values: number[],
    linearR2: number,
  ): 'linear' | 'exponential' | 'stable' | 'erratic' {
    // Check if stable first
    const range = Math.max(...values) - Math.min(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (range / mean < 0.05) return 'stable'; // Less than 5% variation

    // Check linear fit quality
    if (linearR2 > 0.9) return 'linear';

    // Try exponential: fit log(values) linearly
    const logValues = values.map((v) => Math.log(Math.max(v, 1)));
    const expRegression = linearRegression(timestamps, logValues);

    if (expRegression.rSquared > linearR2 && expRegression.rSquared > 0.9) {
      return 'exponential';
    }

    if (linearR2 > 0.7) return 'linear';
    return 'erratic';
  }

  private predictOom(
    regression: RegressionResult,
    lastTimestamp: number,
    currentSize: number,
  ): { predictedMs: number | null; description: string } {
    // Not growing or negligible growth (< 100 bytes/sec = 0.1 bytes/ms)
    if (regression.slope <= 0.1) {
      return {
        predictedMs: null,
        description: 'No OOM risk — memory is stable or shrinking.',
      };
    }

    // Predict when we hit max heap
    const remaining = this.maxHeapBytes - currentSize;
    if (remaining <= 0) {
      return {
        predictedMs: 0,
        description: 'CRITICAL: Current heap size exceeds max heap limit!',
      };
    }

    const msToOom = remaining / regression.slope;

    // More than 24 hours
    if (msToOom > 86_400_000) {
      return {
        predictedMs: null,
        description: `At current growth rate (${formatBytes(regression.slope * 1000)}/sec), OOM would take >24 hours. Low risk.`,
      };
    }

    // Less than 1 minute
    if (msToOom < 60_000) {
      return {
        predictedMs: msToOom,
        description:
          `CRITICAL: At current growth rate, OOM in ~${Math.ceil(msToOom / 1000)} seconds! ` +
          `(${formatBytes(regression.slope * 1000)}/sec, ${formatBytes(remaining)} remaining)`,
      };
    }

    // Normal prediction
    return {
      predictedMs: msToOom,
      description:
        `At current growth rate of ${formatBytes(regression.slope * 1000)}/sec, ` +
        `estimated OOM in ~${formatDuration(msToOom)} ` +
        `(${formatBytes(remaining)} remaining of ${formatBytes(this.maxHeapBytes)} max).`,
    };
  }

  private computeStatistics(values: number[]): TrendStatistics {
    const n = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const start = values[0];
    const end = values[n - 1];
    const netChange = end - start;
    const percentChange = start > 0 ? (netChange / start) * 100 : 0;

    return {
      minHeapSize: min,
      maxHeapSize: max,
      meanHeapSize: mean,
      stdDevHeapSize: stdDev,
      startHeapSize: start,
      endHeapSize: end,
      netChange,
      percentChange,
    };
  }

  private analyzeClassGrowth(): ClassGrowthEntry[] {
    // Need at least 2 data points with class summaries
    const withSummaries = this.dataPoints.filter(
      (dp) => dp.classSummaries && dp.classSummaries.length > 0,
    );
    if (withSummaries.length < 2) return [];

    const first = withSummaries[0];
    const last = withSummaries[withSummaries.length - 1];
    const timeSpanSec = (last.timestamp - first.timestamp) / 1000;
    if (timeSpanSec <= 0) return [];

    // Build class maps for first and last
    const firstMap = new Map<string, ClassSummary>();
    for (const cls of first.classSummaries!) {
      firstMap.set(cls.className, cls);
    }

    const lastMap = new Map<string, ClassSummary>();
    for (const cls of last.classSummaries!) {
      lastMap.set(cls.className, cls);
    }

    // Analyze growth for all classes present in the last snapshot
    const entries: ClassGrowthEntry[] = [];
    let totalSizeGrowth = 0;

    for (const [className, lastCls] of lastMap) {
      const firstCls = firstMap.get(className);
      const firstCount = firstCls?.count ?? 0;
      const firstSize = firstCls?.retainedSize ?? 0;

      const countDelta = lastCls.count - firstCount;
      const sizeDelta = lastCls.retainedSize - firstSize;

      if (sizeDelta > 0) totalSizeGrowth += sizeDelta;

      // Build series from all data points
      const countSeries: number[] = [];
      const sizeSeries: number[] = [];
      for (const dp of withSummaries) {
        const cls = dp.classSummaries!.find((c) => c.className === className);
        countSeries.push(cls?.count ?? 0);
        sizeSeries.push(cls?.retainedSize ?? 0);
      }

      entries.push({
        className,
        countSeries,
        sizeSeries,
        instanceGrowthRate: countDelta / timeSpanSec,
        sizeGrowthRate: sizeDelta / timeSpanSec,
        isGrowing: countDelta > 0 && sizeDelta > 0,
        growthShare: 0, // Computed below
      });
    }

    // Compute growth share
    for (const entry of entries) {
      if (totalSizeGrowth > 0 && entry.sizeGrowthRate > 0) {
        entry.growthShare =
          ((entry.sizeGrowthRate * timeSpanSec) / totalSizeGrowth) * 100;
      }
    }

    // Sort by size growth rate (descending)
    entries.sort((a, b) => b.sizeGrowthRate - a.sizeGrowthRate);

    return entries;
  }

  private generateSummary(
    trend: 'growing' | 'stable' | 'shrinking',
    growthRate: number,
    oomResult: { predictedMs: number | null; description: string },
    stats: TrendStatistics,
    classGrowth: ClassGrowthEntry[],
  ): string {
    const parts: string[] = [];

    parts.push(
      `Memory is ${trend} at ${formatBytes(Math.abs(growthRate))}/sec over ${this.dataPoints.length} data points. ` +
        `Heap went from ${formatBytes(stats.startHeapSize)} to ${formatBytes(stats.endHeapSize)} ` +
        `(${stats.percentChange > 0 ? '+' : ''}${stats.percentChange.toFixed(1)}%).`,
    );

    if (trend === 'growing' && oomResult.predictedMs !== null) {
      parts.push(oomResult.description);
    }

    const topGrowers = classGrowth.filter((c) => c.isGrowing).slice(0, 3);
    if (topGrowers.length > 0) {
      parts.push(
        `Top growing classes: ${topGrowers.map((c) => `${c.className} (+${formatBytes(c.sizeGrowthRate)}/sec)`).join(', ')}.`,
      );
    }

    return parts.join(' ');
  }
}

// ─── Math Utilities ──────────────────────────────────────────────────────────

/**
 * Simple linear regression: y = slope * x + intercept
 * Returns slope, intercept, and R² value.
 */
function linearRegression(x: number[], y: number[]): RegressionResult {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0, rSquared: 0 };

  // Mean-center the inputs for numerical stability.
  // Raw timestamps (~1.7e12) lose precision when squared (~2.9e24)
  // because IEEE 754 doubles only have ~15 significant digits.
  // Centering reduces the magnitude to ~1e3–1e6, eliminating the issue.
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;

  let sumXcYc = 0; // Σ(xᵢ - x̄)(yᵢ - ȳ)
  let sumXc2 = 0; // Σ(xᵢ - x̄)²
  let ssTot = 0; // Σ(yᵢ - ȳ)²  (for R²)

  for (let i = 0; i < n; i++) {
    const xc = x[i] - meanX;
    const yc = y[i] - meanY;
    sumXcYc += xc * yc;
    sumXc2 += xc * xc;
    ssTot += yc * yc;
  }

  if (sumXc2 === 0) return { slope: 0, intercept: meanY, rSquared: 0 };

  const slope = sumXcYc / sumXc2;
  const intercept = meanY - slope * meanX;

  // R² computation
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * x[i] + intercept;
    ssRes += (y[i] - predicted) ** 2;
  }

  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared: Math.max(0, rSquared) };
}

// ─── Display Utilities ──────────────────────────────────────────────────────

function generateSparkline(min: number, max: number, values: number[]): string {
  const chars = '▁▂▃▄▅▆▇█';
  const range = max - min || 1;

  return (
    '  ' +
    values
      .map((v) => {
        const normalized = (v - min) / range;
        const idx = Math.min(
          Math.floor(normalized * chars.length),
          chars.length - 1,
        );
        return chars[idx];
      })
      .join('')
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000)
    return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${mins}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  // BUG FIX #15: Same as BUG #10 — handle negative bytes and clamp index
  // to prevent units[negative] → undefined or units[>3] → undefined.
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    units.length - 1,
  );
  const value = abs / Math.pow(1024, i);
  return `${sign}${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
