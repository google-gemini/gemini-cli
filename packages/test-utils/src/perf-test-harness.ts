/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Configuration for asciichart plot function. */
interface PlotConfig {
  height?: number;
  format?: (x: number) => string;
}

/** Type for the asciichart plot function. */
type PlotFn = (series: number[], config?: PlotConfig) => string;

/**
 * Baseline entry for a single performance test scenario.
 */
export interface PerfBaseline {
  wallClockMs: number;
  cpuTotalUs: number;
  timestamp: string;
}

/**
 * Top-level structure of the perf baselines JSON file.
 */
export interface PerfBaselineFile {
  version: number;
  updatedAt: string;
  scenarios: Record<string, PerfBaseline>;
}

/**
 * A single performance snapshot at a point in time.
 */
export interface PerfSnapshot {
  timestamp: number;
  label: string;
  wallClockMs: number;
  cpuUserUs: number;
  cpuSystemUs: number;
  cpuTotalUs: number;
  eventLoopDelayP50Ms: number;
  eventLoopDelayP95Ms: number;
  eventLoopDelayMaxMs: number;
  childEventLoopDelayP50Ms?: number;
  childEventLoopDelayP95Ms?: number;
  childEventLoopDelayMaxMs?: number;
}

/**
 * Result from running a performance test scenario.
 */
export interface PerfTestResult {
  scenarioName: string;
  samples: PerfSnapshot[];
  filteredSamples: PerfSnapshot[];
  median: PerfSnapshot;
  baseline: PerfBaseline | undefined;
  withinTolerance: boolean;
  deltaPercent: number;
  cpuDeltaPercent: number;
}

/**
 * Options for the PerfTestHarness.
 */
export interface PerfTestHarnessOptions {
  /** Path to the baselines JSON file */
  baselinesPath: string;
  /** Default tolerance percentage (0-100). Default: 15 */
  defaultTolerancePercent?: number;
  /** Default CPU tolerance percentage (0-100). Optional */
  defaultCpuTolerancePercent?: number;
  /** Number of samples per scenario. Default: 5 */
  sampleCount?: number;
  /** Number of warmup runs to discard. Default: 1 */
  warmupCount?: number;
  /** Pause in ms between samples. Default: 100 */
  samplePauseMs?: number;
}

/**
 * Active timer state tracked internally.
 */
interface ActiveTimer {
  label: string;
  startTime: number;
  startCpuUsage: NodeJS.CpuUsage;
}

/**
 * PerfTestHarness provides infrastructure for running CPU performance tests.
 *
 * It handles:
 * - High-resolution wall-clock timing via performance.now()
 * - CPU usage measurement via process.cpuUsage()
 * - Event loop delay monitoring via perf_hooks.monitorEventLoopDelay()
 * - IQR outlier filtering for noise reduction
 * - Warmup runs to avoid JIT compilation noise
 * - Comparing against baselines with configurable tolerance
 * - Generating ASCII chart reports
 */
export class PerfTestHarness {
  private baselines: PerfBaselineFile;
  private readonly baselinesPath: string;
  private readonly defaultTolerancePercent: number;
  private readonly defaultCpuTolerancePercent?: number;
  private readonly sampleCount: number;
  private readonly warmupCount: number;
  private readonly samplePauseMs: number;
  private allResults: PerfTestResult[] = [];
  private activeTimers: Map<string, ActiveTimer> = new Map();

  constructor(options: PerfTestHarnessOptions) {
    this.baselinesPath = options.baselinesPath;
    this.defaultTolerancePercent = options.defaultTolerancePercent ?? 15;
    this.defaultCpuTolerancePercent = options.defaultCpuTolerancePercent;
    this.sampleCount = options.sampleCount ?? 5;
    this.warmupCount = options.warmupCount ?? 1;
    this.samplePauseMs = options.samplePauseMs ?? 100;
    this.baselines = loadPerfBaselines(this.baselinesPath);
  }

  /**
   * Start a high-resolution timer with CPU tracking.
   */
  startTimer(label: string): void {
    this.activeTimers.set(label, {
      label,
      startTime: performance.now(),
      startCpuUsage: process.cpuUsage(),
    });
  }

  /**
   * Stop a timer and return the snapshot.
   */
  stopTimer(label: string): PerfSnapshot {
    const timer = this.activeTimers.get(label);
    if (!timer) {
      throw new Error(`No active timer found for label "${label}"`);
    }

    const wallClockMs = performance.now() - timer.startTime;
    const cpuDelta = process.cpuUsage(timer.startCpuUsage);
    this.activeTimers.delete(label);

    return {
      timestamp: Date.now(),
      label,
      wallClockMs,
      cpuUserUs: cpuDelta.user,
      cpuSystemUs: cpuDelta.system,
      cpuTotalUs: cpuDelta.user + cpuDelta.system,
      eventLoopDelayP50Ms: 0,
      eventLoopDelayP95Ms: 0,
      eventLoopDelayMaxMs: 0,
    };
  }

  /**
   * Measure a function's wall-clock time and CPU usage.
   * Returns the snapshot with timing data.
   */
  async measure(label: string, fn: () => Promise<void>): Promise<PerfSnapshot> {
    this.startTimer(label);
    await fn();
    return this.stopTimer(label);
  }

  /**
   * Measure a function with event loop delay monitoring.
   * Uses perf_hooks.monitorEventLoopDelay() for histogram data.
   */
  async measureWithEventLoop(
    label: string,
    fn: () => Promise<void>,
  ): Promise<PerfSnapshot> {
    // monitorEventLoopDelay is available in Node.js 12+
    const { monitorEventLoopDelay } = await import('node:perf_hooks');
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();

    this.startTimer(label);
    await fn();
    const snapshot = this.stopTimer(label);

    histogram.disable();

    // Convert from nanoseconds to milliseconds
    snapshot.eventLoopDelayP50Ms = histogram.percentile(50) / 1e6;
    snapshot.eventLoopDelayP95Ms = histogram.percentile(95) / 1e6;
    snapshot.eventLoopDelayMaxMs = histogram.max / 1e6;

    return snapshot;
  }

  /**
   * Run a scenario multiple times with warmup, outlier filtering, and baseline comparison.
   *
   * @param name - Scenario name (must match baseline key)
   * @param fn - Async function that executes one sample of the scenario.
   *             Must return a PerfSnapshot with measured values.
   * @param tolerancePercent - Override default tolerance for this scenario
   */
  async runScenario(
    name: string,
    fn: () => Promise<PerfSnapshot>,
    tolerancePercent?: number,
  ): Promise<PerfTestResult> {
    const tolerance = tolerancePercent ?? this.defaultTolerancePercent;
    const totalRuns = this.warmupCount + this.sampleCount;
    const allSnapshots: PerfSnapshot[] = [];

    for (let i = 0; i < totalRuns; i++) {
      const isWarmup = i < this.warmupCount;
      const snapshot = await fn();
      snapshot.label = isWarmup
        ? `warmup-${i}`
        : `sample-${i - this.warmupCount}`;

      if (!isWarmup) {
        allSnapshots.push(snapshot);
      }

      // Brief pause between samples
      await sleep(this.samplePauseMs);
    }

    // Apply IQR outlier filtering on wall-clock time
    const filteredSnapshots = this.filterOutliers(allSnapshots, 'wallClockMs');

    // Get median of filtered samples
    const median = this.getMedianSnapshot(filteredSnapshots);
    median.label = 'median';

    // Get baseline
    const baseline = this.baselines.scenarios[name];

    // Determine if within tolerance
    let deltaPercent = 0;
    let cpuDeltaPercent = 0;
    let withinTolerance = true;

    if (baseline) {
      deltaPercent =
        ((median.wallClockMs - baseline.wallClockMs) / baseline.wallClockMs) *
        100;
      cpuDeltaPercent =
        ((median.cpuTotalUs - baseline.cpuTotalUs) / baseline.cpuTotalUs) * 100;
      withinTolerance = deltaPercent <= tolerance;
    }

    const result: PerfTestResult = {
      scenarioName: name,
      samples: allSnapshots,
      filteredSamples: filteredSnapshots,
      median,
      baseline,
      withinTolerance,
      deltaPercent,
      cpuDeltaPercent,
    };

    this.allResults.push(result);
    return result;
  }

  /**
   * Assert that a scenario result is within the baseline tolerance.
   */
  assertWithinBaseline(
    result: PerfTestResult,
    tolerancePercent?: number,
    cpuTolerancePercent?: number,
  ): void {
    const tolerance = tolerancePercent ?? this.defaultTolerancePercent;
    const cpuTolerance = cpuTolerancePercent ?? this.defaultCpuTolerancePercent;

    if (!result.baseline) {
      console.warn(
        `⚠ No baseline found for "${result.scenarioName}". ` +
          `Run with UPDATE_PERF_BASELINES=true to create one. ` +
          `Measured: ${result.median.wallClockMs.toFixed(1)} ms wall-clock.`,
      );
      return;
    }

    const deltaPercent =
      ((result.median.wallClockMs - result.baseline.wallClockMs) /
        result.baseline.wallClockMs) *
      100;

    if (deltaPercent > tolerance) {
      throw new Error(
        `Performance regression detected for "${result.scenarioName}"!\n` +
          `  Measured:    ${result.median.wallClockMs.toFixed(1)} ms wall-clock\n` +
          `  Baseline:    ${result.baseline.wallClockMs.toFixed(1)} ms wall-clock\n` +
          `  Delta:       ${deltaPercent.toFixed(1)}% (tolerance: ${tolerance}%)\n` +
          `  CPU total:   ${formatUs(result.median.cpuTotalUs)}\n` +
          `  Samples:     ${result.samples.length} (${result.filteredSamples.length} after IQR filter)`,
      );
    }

    if (cpuTolerance !== undefined && result.cpuDeltaPercent > cpuTolerance) {
      throw new Error(
        `CPU usage regression detected for "${result.scenarioName}"!\n` +
          `  Measured:    ${formatUs(result.median.cpuTotalUs)}\n` +
          `  Baseline:    ${formatUs(result.baseline.cpuTotalUs)}\n` +
          `  Delta:       ${result.cpuDeltaPercent.toFixed(1)}% (tolerance: ${cpuTolerance}%)\n` +
          `  Wall-clock:  ${result.median.wallClockMs.toFixed(1)} ms`,
      );
    }
  }

  /**
   * Update the baseline for a scenario with the current measured values.
   */
  updateScenarioBaseline(result: PerfTestResult): void {
    updatePerfBaseline(this.baselinesPath, result.scenarioName, {
      wallClockMs: result.median.wallClockMs,
      cpuTotalUs: result.median.cpuTotalUs,
    });
    // Reload baselines after update
    this.baselines = loadPerfBaselines(this.baselinesPath);
    console.log(
      `Updated baseline for ${result.scenarioName}: ${result.median.wallClockMs.toFixed(1)} ms`,
    );
  }

  /**
   * Generate an ASCII report with summary table and charts.
   */
  async generateReport(results?: PerfTestResult[]): Promise<string> {
    const resultsToReport = results ?? this.allResults;
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('         PERFORMANCE TEST REPORT');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('');

    for (const result of resultsToReport) {
      const measured = `${result.median.wallClockMs.toFixed(1)} ms`;
      const baseline = result.baseline
        ? `${result.baseline.wallClockMs.toFixed(1)} ms`
        : 'N/A';
      const delta = result.baseline
        ? `${result.deltaPercent >= 0 ? '+' : ''}${result.deltaPercent.toFixed(1)}%`
        : 'N/A';
      const status = !result.baseline
        ? 'NEW'
        : result.withinTolerance
          ? '✅'
          : '❌';

      lines.push(
        `${result.scenarioName}: ${measured} (Baseline: ${baseline}, Delta: ${delta}) ${status}`,
      );

      // Show CPU breakdown
      const cpuMs = `${(result.median.cpuTotalUs / 1000).toFixed(1)} ms`;
      lines.push(
        `  CPU: ${cpuMs} (user: ${formatUs(result.median.cpuUserUs)}, system: ${formatUs(result.median.cpuSystemUs)})`,
      );

      if (result.median.eventLoopDelayMaxMs > 0) {
        lines.push(
          `  Event loop (runner): p50=${result.median.eventLoopDelayP50Ms.toFixed(1)}ms p95=${result.median.eventLoopDelayP95Ms.toFixed(1)}ms max=${result.median.eventLoopDelayMaxMs.toFixed(1)}ms`,
        );
      }

      if (
        result.median.childEventLoopDelayMaxMs !== undefined &&
        result.median.childEventLoopDelayMaxMs > 0
      ) {
        lines.push(
          `  Event loop (CLI):    p50=${result.median.childEventLoopDelayP50Ms!.toFixed(1)}ms p95=${result.median.childEventLoopDelayP95Ms!.toFixed(1)}ms max=${result.median.childEventLoopDelayMaxMs!.toFixed(1)}ms`,
        );
      }

      lines.push(
        `  Samples: ${result.samples.length} → ${result.filteredSamples.length} after IQR filter`,
      );
    }
    lines.push('');

    // Generate ASCII chart for wall-clock per scenario
    try {
      // @ts-expect-error - asciichart may not have types
      const asciichart = (await import('asciichart')) as {
        default?: { plot?: PlotFn };
        plot?: PlotFn;
      };
      const plot: PlotFn | undefined =
        asciichart.default?.plot ?? asciichart.plot;

      for (const result of resultsToReport) {
        if (result.filteredSamples.length > 2) {
          lines.push(`📈 Wall-clock trend: ${result.scenarioName}`);
          lines.push('─'.repeat(60));

          const wallClockData = result.filteredSamples.map(
            (s) => s.wallClockMs,
          );

          if (plot) {
            const chart = plot(wallClockData, {
              height: 8,
              format: (x: number) => `${x.toFixed(0)} ms`.padStart(10),
            });
            lines.push(chart);
          }

          const labels = result.filteredSamples.map((s) => s.label);
          lines.push('  ' + labels.join(' → '));
          lines.push('');
        }
      }
    } catch {
      lines.push(
        '(asciichart not available — install with: npm install --save-dev asciichart)',
      );
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════');
    lines.push('');

    const report = lines.join('\n');
    console.log(report);
    return report;
  }

  /**
   * Filter outliers using the Interquartile Range (IQR) method.
   * Removes samples where the given metric falls outside Q1 - 1.5*IQR or Q3 + 1.5*IQR.
   */
  private filterOutliers(
    snapshots: PerfSnapshot[],
    metric: keyof PerfSnapshot,
  ): PerfSnapshot[] {
    if (snapshots.length < 4) {
      // Not enough data for meaningful IQR filtering
      return [...snapshots];
    }

    const sorted = [...snapshots].sort(
      (a, b) => (a[metric] as number) - (b[metric] as number),
    );
    const q1Idx = Math.floor(sorted.length * 0.25);
    const q3Idx = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Idx]![metric] as number;
    const q3 = sorted[q3Idx]![metric] as number;
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return snapshots.filter((s) => {
      const val = s[metric] as number;
      return val >= lowerBound && val <= upperBound;
    });
  }

  /**
   * Get the median snapshot by wall-clock time from a sorted list.
   */
  private getMedianSnapshot(snapshots: PerfSnapshot[]): PerfSnapshot {
    if (snapshots.length === 0) {
      throw new Error('Cannot compute median of empty snapshot list');
    }

    const sorted = [...snapshots].sort((a, b) => a.wallClockMs - b.wallClockMs);
    const medianIdx = Math.floor(sorted.length / 2);
    return { ...sorted[medianIdx]! };
  }
}

// ─── Baseline management ─────────────────────────────────────────────

/**
 * Load perf baselines from a JSON file.
 */
export function loadPerfBaselines(path: string): PerfBaselineFile {
  if (!existsSync(path)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      scenarios: {},
    };
  }

  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as PerfBaselineFile;
}

/**
 * Save perf baselines to a JSON file.
 */
export function savePerfBaselines(
  path: string,
  baselines: PerfBaselineFile,
): void {
  baselines.updatedAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(baselines, null, 2) + '\n');
}

/**
 * Update (or create) a single scenario baseline in the file.
 */
export function updatePerfBaseline(
  path: string,
  scenarioName: string,
  measured: {
    wallClockMs: number;
    cpuTotalUs: number;
  },
): void {
  const baselines = loadPerfBaselines(path);
  baselines.scenarios[scenarioName] = {
    wallClockMs: measured.wallClockMs,
    cpuTotalUs: measured.cpuTotalUs,
    timestamp: new Date().toISOString(),
  };
  savePerfBaselines(path, baselines);
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Format microseconds as a human-readable string.
 */
function formatUs(us: number): string {
  if (us > 1_000_000) {
    return `${(us / 1_000_000).toFixed(2)} s`;
  }
  if (us > 1_000) {
    return `${(us / 1_000).toFixed(1)} ms`;
  }
  return `${us} μs`;
}
