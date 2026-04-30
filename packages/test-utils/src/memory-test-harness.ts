/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadBaselines, updateBaseline } from './memory-baselines.js';
import type { MemoryBaseline, MemoryBaselineFile } from './memory-baselines.js';
import type { TestRig } from './test-rig.js';

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
}

/**
 * Result from running a memory test scenario.
 */
export interface MemoryTestResult {
  scenarioName: string;
  snapshots: MemorySnapshot[];
  peakHeapUsed: number;
  peakRss: number;
  peakExternal: number;
  finalHeapUsed: number;
  finalRss: number;
  finalExternal: number;
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
 * - Extracting memory metrics from CLI process telemetry
 * - Comparing against baselines with configurable tolerance
 * - Generating ASCII chart reports of memory trends
 */
export class MemoryTestHarness {
  private baselines: MemoryBaselineFile;
  private readonly baselinesPath: string;
  private readonly defaultTolerancePercent: number;
  private allResults: MemoryTestResult[] = [];

  constructor(options: MemoryTestHarnessOptions) {
    this.baselinesPath = options.baselinesPath;
    this.defaultTolerancePercent = options.defaultTolerancePercent ?? 10;
    this.baselines = loadBaselines(this.baselinesPath);
  }

  /**
   * Extract memory snapshot from TestRig telemetry.
   */
  async takeSnapshot(
    rig: TestRig,
    label: string = 'snapshot',
    strategy: 'peak' | 'last' = 'last',
  ): Promise<MemorySnapshot> {
    const metrics = rig.readMemoryMetrics(strategy);

    return {
      timestamp: metrics.timestamp,
      label,
      heapUsed: metrics.heapUsed,
      heapTotal: metrics.heapTotal,
      rss: metrics.rss,
      external: metrics.external,
    };
  }

  /**
   * Run a memory test scenario.
   *
   * @param rig - The TestRig instance running the CLI
   * @param name - Scenario name (must match baseline key)
   * @param fn - Async function that executes the scenario. Receives a
   *   `recordSnapshot` callback for recording intermediate snapshots.
   * @param tolerancePercent - Override default tolerance for this scenario
   */
  async runScenario(
    rig: TestRig,
    name: string,
    fn: (
      recordSnapshot: (label: string) => Promise<MemorySnapshot>,
    ) => Promise<void>,
    tolerancePercent?: number,
  ): Promise<MemoryTestResult> {
    const tolerance = tolerancePercent ?? this.defaultTolerancePercent;
    const snapshots: MemorySnapshot[] = [];

    // Record initial snapshot
    const beforeSnap = await this.takeSnapshot(rig, 'before');
    snapshots.push(beforeSnap);

    // Record a callback for intermediate snapshots
    const recordSnapshot = async (label: string): Promise<MemorySnapshot> => {
      // Small delay to allow telemetry to flush if needed
      await rig.waitForTelemetryReady();
      const snap = await this.takeSnapshot(rig, label);
      snapshots.push(snap);
      return snap;
    };

    // Run the scenario
    await fn(recordSnapshot);

    // Final wait for telemetry to ensure everything is flushed
    await rig.waitForTelemetryReady();

    // After snapshot
    const afterSnap = await this.takeSnapshot(rig, 'after');
    snapshots.push(afterSnap);

    // Calculate peak values from ALL snapshots seen during the scenario
    const allSnapshots = rig.readAllMemorySnapshots();
    const scenarioSnapshots = allSnapshots.filter(
      (s) =>
        s.timestamp >= beforeSnap.timestamp &&
        s.timestamp <= afterSnap.timestamp,
    );

    const peakHeapUsed = Math.max(
      ...scenarioSnapshots.map((s) => s.heapUsed),
      ...snapshots.map((s) => s.heapUsed),
    );
    const peakRss = Math.max(
      ...scenarioSnapshots.map((s) => s.rss),
      ...snapshots.map((s) => s.rss),
    );
    const peakExternal = Math.max(
      ...scenarioSnapshots.map((s) => s.external),
      ...snapshots.map((s) => s.external),
    );

    // Get baseline
    const baseline = this.baselines.scenarios[name];

    // Determine if within tolerance
    let deltaPercent = 0;
    let withinTolerance = true;

    if (baseline) {
      const measuredMB = afterSnap.heapUsed / (1024 * 1024);
      deltaPercent =
        ((measuredMB - baseline.heapUsedMB) / baseline.heapUsedMB) * 100;
      withinTolerance = deltaPercent <= tolerance;
    }

    const result: MemoryTestResult = {
      scenarioName: name,
      snapshots,
      peakHeapUsed,
      peakRss,
      peakExternal,
      finalHeapUsed: afterSnap.heapUsed,
      finalRss: afterSnap.rss,
      finalExternal: afterSnap.external,
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

    const measuredMB = result.finalHeapUsed / (1024 * 1024);
    const deltaPercent =
      ((measuredMB - result.baseline.heapUsedMB) / result.baseline.heapUsedMB) *
      100;

    if (deltaPercent > tolerance) {
      throw new Error(
        `Memory regression detected for "${result.scenarioName}"!\n` +
          `  Measured:  ${formatMB(result.finalHeapUsed)} heap used\n` +
          `  Baseline:  ${result.baseline.heapUsedMB.toFixed(1)} MB heap used\n` +
          `  Delta:     ${deltaPercent.toFixed(1)}% (tolerance: ${tolerance}%)\n` +
          `  Peak heap: ${formatMB(result.peakHeapUsed)}\n` +
          `  Peak RSS:  ${formatMB(result.peakRss)}\n` +
          `  Peak External:  ${formatMB(result.peakExternal)}`,
      );
    }
  }

  /**
   * Update the baseline for a scenario with the current measured values.
   */
  updateScenarioBaseline(result: MemoryTestResult): void {
    const lastSnapshot = result.snapshots[result.snapshots.length - 1];
    updateBaseline(this.baselinesPath, result.scenarioName, {
      heapUsedMB: Number((result.finalHeapUsed / (1024 * 1024)).toFixed(1)),
      heapTotalMB: Number(
        ((lastSnapshot?.heapTotal ?? 0) / (1024 * 1024)).toFixed(1),
      ),
      rssMB: Number((result.finalRss / (1024 * 1024)).toFixed(1)),
      externalMB: Number((result.finalExternal / (1024 * 1024)).toFixed(1)),
    });
    // Reload baselines after update
    this.baselines = loadBaselines(this.baselinesPath);
  }

  /**
   * Analyze snapshots to detect sustained leaks.
   * A leak is flagged if growth is observed in both phases.
   */
  analyzeSnapshots(
    snapshots: MemorySnapshot[],
    thresholdBytes: number = 1024 * 1024, // 1 MB
  ): { leaked: boolean; message: string } {
    if (snapshots.length < 3) {
      return { leaked: false, message: 'Not enough snapshots to analyze' };
    }

    const snap1 = snapshots[snapshots.length - 3];
    const snap2 = snapshots[snapshots.length - 2];
    const snap3 = snapshots[snapshots.length - 1];

    const growth1 = snap2.heapUsed - snap1.heapUsed;
    const growth2 = snap3.heapUsed - snap2.heapUsed;

    const leaked = growth1 > thresholdBytes && growth2 > thresholdBytes;
    let message = leaked
      ? `Memory bloat detected: sustained growth (${formatMB(growth1)} -> ${formatMB(growth2)})`
      : `No sustained growth detected above threshold.`;

    return { leaked, message };
  }

  /**
   * Assert that memory returns to a baseline level after a peak.
   * Useful for verifying that large tool outputs or history are not retained.
   */
  assertMemoryReturnsToBaseline(
    snapshots: MemorySnapshot[],
    tolerancePercent: number = 10,
  ): void {
    if (snapshots.length < 3) {
      throw new Error('Need at least 3 snapshots to check return to baseline');
    }

    // Find the first non-zero snapshot as baseline
    const baseline = snapshots.find((s) => s.heapUsed > 0);
    if (!baseline) {
      return; // No memory reported yet
    }

    const final = snapshots[snapshots.length - 1]!;

    const tolerance = baseline.heapUsed * (tolerancePercent / 100);
    const delta = final.heapUsed - baseline.heapUsed;

    if (delta > tolerance) {
      throw new Error(
        `Memory did not return to baseline!\n` +
          `  Baseline: ${formatMB(baseline.heapUsed)} (${baseline.label})\n` +
          `  Final:    ${formatMB(final.heapUsed)} (${final.label})\n` +
          `  Delta:    ${formatMB(delta)} (tolerance: ${formatMB(tolerance)})`,
      );
    }
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

    for (const result of resultsToReport) {
      const measured = formatMB(result.finalHeapUsed);
      const baseline = result.baseline
        ? `${result.baseline.heapUsedMB.toFixed(1)} MB`
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
    }
    lines.push('');

    // Generate ASCII chart for each scenario with multiple snapshots
    try {
      // @ts-expect-error - asciichart may not have types
      const asciichart = (await import('asciichart')) as {
        default?: { plot?: PlotFn };
        plot?: PlotFn;
      };
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
}

/**
 * Format bytes as a human-readable MB string.
 */
function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
