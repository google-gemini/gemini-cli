/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import { setTimeout as sleep } from 'node:timers/promises';
import { loadBaselines, updateBaseline } from './memory-baselines.js';
import type { MemoryBaseline, MemoryBaselineFile } from './memory-baselines.js';

/** Configuration for asciichart plot function. */
interface PlotConfig {
  height?: number;
  format?: (x: number) => string;
}

/** Type for the asciichart plot function. */
type PlotFn = (series: number[], config?: PlotConfig) => string;

/**
 * A single memory snapshot at a point in time.
 */
export interface MemorySnapshot {
  timestamp: number;
  label: string;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  heapSizeLimit: number;
}

/**
 * Result from running a memory test scenario.
 */
export interface MemoryTestResult {
  scenarioName: string;
  snapshots: MemorySnapshot[];
  peakHeapUsed: number;
  peakRss: number;
  finalHeapUsed: number;
  finalRss: number;
  baseline: MemoryBaseline | undefined;
  withinTolerance: boolean;
  deltaPercent: number;
}

/**
 * Options for the MemoryTestHarness.
 */
export interface MemoryTestHarnessOptions {
  /** Path to the baselines JSON file */
  baselinesPath: string;
  /** Default tolerance percentage (0-100). Default: 10 */
  defaultTolerancePercent?: number;
  /** Number of GC cycles to run before each snapshot. Default: 3 */
  gcCycles?: number;
  /** Delay in ms between GC cycles. Default: 100 */
  gcDelayMs?: number;
  /** Number of samples to take for median calculation. Default: 3 */
  sampleCount?: number;
}

/**
 * MemoryTestHarness provides infrastructure for running memory usage tests.
 *
 * It handles:
 * - Forcing V8 garbage collection to reduce noise
 * - Taking V8 heap snapshots for accurate memory measurement
 * - Comparing against baselines with configurable tolerance
 * - Generating ASCII chart reports of memory trends
 */
export class MemoryTestHarness {
  private baselines: MemoryBaselineFile;
  private readonly baselinesPath: string;
  private readonly defaultTolerancePercent: number;
  private readonly gcCycles: number;
  private readonly gcDelayMs: number;
  private readonly sampleCount: number;
  private allResults: MemoryTestResult[] = [];

  constructor(options: MemoryTestHarnessOptions) {
    this.baselinesPath = options.baselinesPath;
    this.defaultTolerancePercent = options.defaultTolerancePercent ?? 10;
    this.gcCycles = options.gcCycles ?? 3;
    this.gcDelayMs = options.gcDelayMs ?? 100;
    this.sampleCount = options.sampleCount ?? 3;
    this.baselines = loadBaselines(this.baselinesPath);
  }

  /**
   * Force garbage collection multiple times and take a V8 heap snapshot.
   * Forces GC multiple times with delays to allow weak references and
   * FinalizationRegistry callbacks to run, reducing measurement noise.
   */
  async takeSnapshot(label: string = 'snapshot'): Promise<MemorySnapshot> {
    await this.forceGC();

    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      label,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      heapSizeLimit: heapStats.heap_size_limit,
    };
  }

  /**
   * Take multiple snapshot samples and return the median to reduce noise.
   */
  async takeMedianSnapshot(
    label: string = 'median',
    count?: number,
  ): Promise<MemorySnapshot> {
    const samples: MemorySnapshot[] = [];
    const numSamples = count ?? this.sampleCount;

    for (let i = 0; i < numSamples; i++) {
      samples.push(await this.takeSnapshot(`${label}_sample_${i}`));
      if (i < numSamples - 1) {
        await sleep(50); // Brief pause between samples
      }
    }

    // Sort by heapUsed and take the median
    samples.sort((a, b) => a.heapUsed - b.heapUsed);
    const medianIdx = Math.floor(samples.length / 2);
    const median = samples[medianIdx]!;

    return {
      ...median,
      label,
      timestamp: Date.now(),
    };
  }

  /**
   * Run a memory test scenario.
   *
   * Takes before/after snapshots around the scenario function, collects
   * intermediate snapshots if the scenario provides them, and compares
   * the result against the stored baseline.
   *
   * @param name - Scenario name (must match baseline key)
   * @param fn - Async function that executes the scenario. Receives a
   *   `recordSnapshot` callback for recording intermediate snapshots.
   * @param tolerancePercent - Override default tolerance for this scenario
   */
  async runScenario(
    name: string,
    fn: (
      recordSnapshot: (label: string) => Promise<MemorySnapshot>,
    ) => Promise<void>,
    tolerancePercent?: number,
  ): Promise<MemoryTestResult> {
    const tolerance = tolerancePercent ?? this.defaultTolerancePercent;
    const snapshots: MemorySnapshot[] = [];

    // Record a callback for intermediate snapshots
    const recordSnapshot = async (label: string): Promise<MemorySnapshot> => {
      const snap = await this.takeMedianSnapshot(label);
      snapshots.push(snap);
      return snap;
    };

    // Before snapshot
    const beforeSnap = await this.takeMedianSnapshot('before');
    snapshots.push(beforeSnap);

    // Run the scenario
    await fn(recordSnapshot);

    // After snapshot (median of multiple samples)
    const afterSnap = await this.takeMedianSnapshot('after');
    snapshots.push(afterSnap);

    // Calculate peak values
    const peakHeapUsed = Math.max(...snapshots.map((s) => s.heapUsed));
    const peakRss = Math.max(...snapshots.map((s) => s.rss));

    // Get baseline
    const baseline = this.baselines.scenarios[name];

    // Determine if within tolerance
    let deltaPercent = 0;
    let withinTolerance = true;

    if (baseline) {
      deltaPercent =
        ((afterSnap.heapUsed - baseline.heapUsedBytes) /
          baseline.heapUsedBytes) *
        100;
      withinTolerance = deltaPercent <= tolerance;
    }

    const result: MemoryTestResult = {
      scenarioName: name,
      snapshots,
      peakHeapUsed,
      peakRss,
      finalHeapUsed: afterSnap.heapUsed,
      finalRss: afterSnap.rss,
      baseline,
      withinTolerance,
      deltaPercent,
    };

    this.allResults.push(result);
    return result;
  }

  /**
   * Assert that a scenario result is within the baseline tolerance.
   * Throws an assertion error with details if it exceeds the threshold.
   */
  assertWithinBaseline(
    result: MemoryTestResult,
    tolerancePercent?: number,
  ): void {
    const tolerance = tolerancePercent ?? this.defaultTolerancePercent;

    if (!result.baseline) {
      console.warn(
        `⚠ No baseline found for "${result.scenarioName}". ` +
          `Run with UPDATE_MEMORY_BASELINES=true to create one. ` +
          `Measured: ${formatMB(result.finalHeapUsed)} heap used.`,
      );
      return; // Don't fail if no baseline exists yet
    }

    const deltaPercent =
      ((result.finalHeapUsed - result.baseline.heapUsedBytes) /
        result.baseline.heapUsedBytes) *
      100;

    if (deltaPercent > tolerance) {
      throw new Error(
        `Memory regression detected for "${result.scenarioName}"!\n` +
          `  Measured:  ${formatMB(result.finalHeapUsed)} heap used\n` +
          `  Baseline:  ${formatMB(result.baseline.heapUsedBytes)} heap used\n` +
          `  Delta:     ${deltaPercent.toFixed(1)}% (tolerance: ${tolerance}%)\n` +
          `  Peak heap: ${formatMB(result.peakHeapUsed)}\n` +
          `  Peak RSS:  ${formatMB(result.peakRss)}`,
      );
    }
  }

  /**
   * Update the baseline for a scenario with the current measured values.
   */
  updateScenarioBaseline(result: MemoryTestResult): void {
    updateBaseline(this.baselinesPath, result.scenarioName, {
      heapUsedBytes: result.finalHeapUsed,
      heapTotalBytes:
        result.snapshots[result.snapshots.length - 1]?.heapTotal ?? 0,
      rssBytes: result.finalRss,
    });
    // Reload baselines after update
    this.baselines = loadBaselines(this.baselinesPath);
  }

  /**
   * Generate a report with ASCII charts and summary table.
   * Uses the `asciichart` library for terminal visualization.
   */
  async generateReport(results?: MemoryTestResult[]): Promise<string> {
    const resultsToReport = results ?? this.allResults;
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('         MEMORY USAGE TEST REPORT');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('');

    // Summary table
    lines.push(
      '┌─────────────────────────────────────┬────────────┬────────────┬─────────┬────────┐',
    );
    lines.push(
      '│ Scenario                            │ Measured   │ Baseline   │ Delta%  │ Status │',
    );
    lines.push(
      '├─────────────────────────────────────┼────────────┼────────────┼─────────┼────────┤',
    );

    for (const result of resultsToReport) {
      const measured = formatMB(result.finalHeapUsed).padStart(8);
      const baseline = result.baseline
        ? formatMB(result.baseline.heapUsedBytes).padStart(8)
        : '     N/A';
      const delta = result.baseline
        ? `${result.deltaPercent >= 0 ? '+' : ''}${result.deltaPercent.toFixed(1)}%`.padStart(
            7,
          )
        : '    N/A';
      const status = !result.baseline
        ? ' NEW  '
        : result.withinTolerance
          ? '  ✅  '
          : '  ❌  ';
      const name = result.scenarioName.padEnd(35);

      lines.push(
        `│ ${name} │ ${measured} │ ${baseline} │ ${delta} │${status}│`,
      );
    }

    lines.push(
      '└─────────────────────────────────────┴────────────┴────────────┴─────────┴────────┘',
    );
    lines.push('');

    // Generate ASCII chart for each scenario with multiple snapshots
    try {
      // Dynamic import for asciichart — use indirect import to avoid tsc resolution
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const importFn = new Function(
        'specifier',
        'return import(specifier)',
      ) as (
        specifier: string,
      ) => Promise<{ default?: { plot?: PlotFn }; plot?: PlotFn }>;
      const asciichart = await importFn('asciichart');
      const plot: PlotFn | undefined =
        asciichart.default?.plot ?? asciichart.plot;

      for (const result of resultsToReport) {
        if (result.snapshots.length > 2) {
          lines.push(`📈 Memory trend: ${result.scenarioName}`);
          lines.push('─'.repeat(60));

          const heapDataMB = result.snapshots.map(
            (s) => s.heapUsed / (1024 * 1024),
          );

          if (plot) {
            const chart = plot(heapDataMB, {
              height: 10,
              format: (x: number) => `${x.toFixed(1)} MB`.padStart(10),
            });
            lines.push(chart);
          }

          // Label the x-axis with snapshot labels
          const labels = result.snapshots.map((s) => s.label);
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
   * Force V8 garbage collection.
   * Runs multiple GC cycles with delays to allow weak references
   * and FinalizationRegistry callbacks to run.
   */
  private async forceGC(): Promise<void> {
    if (typeof globalThis.gc !== 'function') {
      console.warn(
        'global.gc() not available. Run with --expose-gc for accurate measurements.',
      );
      return;
    }

    for (let i = 0; i < this.gcCycles; i++) {
      globalThis.gc();
      if (i < this.gcCycles - 1) {
        await sleep(this.gcDelayMs);
      }
    }
    // Final short pause for cleanup
    await sleep(50);
  }
}

/**
 * Format bytes as a human-readable MB string.
 */
function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
