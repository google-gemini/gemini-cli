/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Three-snapshot memory leak detection using the 3-snapshot technique.
 *
 * The 3-snapshot technique captures heap snapshots at three points in time:
 *   1. Baseline - initial state
 *   2. Midpoint - after suspected leaking operations
 *   3. Final - after more operations
 *
 * Objects that appear in snapshot 2 but not 1, and persist in snapshot 3,
 * are likely leaks. By comparing growth patterns across all three snapshots,
 * we can distinguish genuine leaks from transient allocations.
 *
 * @see https://developer.chrome.com/docs/devtools/memory-problems#the_three_snapshot_technique
 */

import v8 from 'node:v8';
import process from 'node:process';
import { bytesToMB } from '../utils/formatters.js';

/**
 * A lightweight memory snapshot for leak comparison.
 * Uses process.memoryUsage() and v8.getHeapStatistics() rather than
 * full heap dumps, keeping overhead low enough for automated use.
 */
export interface LeakDetectorSnapshot {
  /** Monotonic index (1, 2, or 3) */
  index: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** V8 heap used bytes */
  heapUsed: number;
  /** V8 heap total bytes */
  heapTotal: number;
  /** External C++ memory managed by V8 */
  external: number;
  /** Resident set size */
  rss: number;
  /** ArrayBuffer memory */
  arrayBuffers: number;
  /** Per-heap-space breakdown */
  heapSpaces: HeapSpaceEntry[];
}

export interface HeapSpaceEntry {
  name: string;
  size: number;
  used: number;
  available: number;
  physicalSize: number;
}

/**
 * Growth measurement between two snapshots.
 */
export interface GrowthDelta {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  /** Per-space growth keyed by space name */
  heapSpaces: Record<string, number>;
}

/**
 * A suspected leak identified by the detector.
 */
export interface SuspectedLeak {
  /** Which memory region is growing (e.g. 'heapUsed', 'external', space name) */
  region: string;
  /** Bytes grown between snapshot 1→2 */
  growthPhase1: number;
  /** Bytes grown between snapshot 2→3 */
  growthPhase2: number;
  /** Total bytes grown across both phases */
  totalGrowth: number;
  /** Severity: 'low' | 'medium' | 'high' based on sustained growth rate */
  severity: 'low' | 'medium' | 'high';
  /** Human-readable description */
  description: string;
}

/**
 * Complete result of a three-snapshot analysis.
 */
export interface LeakDetectionResult {
  /** The three captured snapshots */
  snapshots: [LeakDetectorSnapshot, LeakDetectorSnapshot, LeakDetectorSnapshot];
  /** Growth from snapshot 1→2 */
  growthPhase1: GrowthDelta;
  /** Growth from snapshot 2→3 */
  growthPhase2: GrowthDelta;
  /** Identified suspected leaks (empty if none) */
  suspectedLeaks: SuspectedLeak[];
  /** Overall assessment */
  summary: string;
  /** Total wall-clock time of the analysis in milliseconds */
  durationMs: number;
}

/**
 * Configuration for the leak detector.
 */
export interface LeakDetectorConfig {
  /**
   * Minimum absolute growth in bytes to consider suspicious.
   * Default: 1 MB (1_048_576 bytes).
   */
  minGrowthBytes?: number;
  /**
   * Minimum percentage growth between phases to flag.
   * Default: 10 (i.e. 10%).
   */
  minGrowthPercent?: number;
}

const DEFAULT_MIN_GROWTH_BYTES = 1_048_576; // 1 MB
const DEFAULT_MIN_GROWTH_PERCENT = 10;

/**
 * Capture a single lightweight snapshot.
 */
export function captureLeakSnapshot(index: number): LeakDetectorSnapshot {
  const memUsage = process.memoryUsage();
  const heapSpaces = v8.getHeapSpaceStatistics().map((space) => ({
    name: space.space_name,
    size: space.space_size,
    used: space.space_used_size,
    available: space.space_available_size,
    physicalSize: space.physical_space_size,
  }));

  return {
    index,
    timestamp: Date.now(),
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    rss: memUsage.rss,
    arrayBuffers: memUsage.arrayBuffers,
    heapSpaces,
  };
}

/**
 * Calculate growth between two snapshots.
 */
export function calculateGrowth(
  before: LeakDetectorSnapshot,
  after: LeakDetectorSnapshot,
): GrowthDelta {
  const heapSpaces: Record<string, number> = {};
  const allSpaceNames = new Set([
    ...before.heapSpaces.map((s) => s.name),
    ...after.heapSpaces.map((s) => s.name),
  ]);

  for (const spaceName of allSpaceNames) {
    const beforeUsed =
      before.heapSpaces.find((s) => s.name === spaceName)?.used ?? 0;
    const afterUsed =
      after.heapSpaces.find((s) => s.name === spaceName)?.used ?? 0;
    heapSpaces[spaceName] = afterUsed - beforeUsed;
  }

  return {
    heapUsed: after.heapUsed - before.heapUsed,
    heapTotal: after.heapTotal - before.heapTotal,
    external: after.external - before.external,
    rss: after.rss - before.rss,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    heapSpaces,
  };
}

/**
 * Classify severity based on sustained growth rate.
 *
 * - high:   both phases grew and total > 10 MB
 * - medium: both phases grew and total > 1 MB (or one phase > 5 MB)
 * - low:    growth detected but marginal
 */
function classifySeverity(
  growthPhase1: number,
  growthPhase2: number,
): 'low' | 'medium' | 'high' {
  const total = growthPhase1 + growthPhase2;
  const bothGrowing = growthPhase1 > 0 && growthPhase2 > 0;

  if (bothGrowing && total > 10 * 1_048_576) {
    return 'high';
  }
  if (
    (bothGrowing && total > 1_048_576) ||
    growthPhase1 > 5 * 1_048_576 ||
    growthPhase2 > 5 * 1_048_576
  ) {
    return 'medium';
  }
  return 'low';
}

/**
 * Analyze three snapshots and identify suspected leaks.
 *
 * A region is flagged if:
 *   1. Growth in BOTH phases exceeds `minGrowthBytes`, AND
 *   2. Growth in BOTH phases exceeds `minGrowthPercent` of the baseline.
 *
 * This two-phase requirement filters out one-time allocations that stabilise.
 */
export function analyzeSnapshots(
  snapshots: [LeakDetectorSnapshot, LeakDetectorSnapshot, LeakDetectorSnapshot],
  config: LeakDetectorConfig = {},
): LeakDetectionResult {
  const startTime = snapshots[0].timestamp;
  const endTime = snapshots[2].timestamp;

  const minBytes = config.minGrowthBytes ?? DEFAULT_MIN_GROWTH_BYTES;
  const minPercent = config.minGrowthPercent ?? DEFAULT_MIN_GROWTH_PERCENT;

  const growthPhase1 = calculateGrowth(snapshots[0], snapshots[1]);
  const growthPhase2 = calculateGrowth(snapshots[1], snapshots[2]);

  const suspectedLeaks: SuspectedLeak[] = [];

  // Check top-level memory regions
  const regions: Array<{
    name: string;
    baseline: number;
    g1: number;
    g2: number;
  }> = [
    {
      name: 'heapUsed',
      baseline: snapshots[0].heapUsed,
      g1: growthPhase1.heapUsed,
      g2: growthPhase2.heapUsed,
    },
    {
      name: 'external',
      baseline: snapshots[0].external,
      g1: growthPhase1.external,
      g2: growthPhase2.external,
    },
    {
      name: 'arrayBuffers',
      baseline: snapshots[0].arrayBuffers,
      g1: growthPhase1.arrayBuffers,
      g2: growthPhase2.arrayBuffers,
    },
  ];

  for (const region of regions) {
    if (
      isSustainedGrowth(
        region.baseline,
        region.g1,
        region.g2,
        minBytes,
        minPercent,
      )
    ) {
      const severity = classifySeverity(region.g1, region.g2);
      suspectedLeaks.push({
        region: region.name,
        growthPhase1: region.g1,
        growthPhase2: region.g2,
        totalGrowth: region.g1 + region.g2,
        severity,
        description: formatLeakDescription(region.name, region.g1, region.g2),
      });
    }
  }

  // Check individual heap spaces — union across all three snapshots
  // to catch spaces created after the first snapshot
  const allSpaceNames = new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.heapSpaces.map((space) => space.name),
    ),
  );

  for (const spaceName of allSpaceNames) {
    const baselineUsed =
      snapshots[0].heapSpaces.find((s) => s.name === spaceName)?.used ?? 0;
    const g1 = growthPhase1.heapSpaces[spaceName] ?? 0;
    const g2 = growthPhase2.heapSpaces[spaceName] ?? 0;

    if (isSustainedGrowth(baselineUsed, g1, g2, minBytes, minPercent)) {
      const severity = classifySeverity(g1, g2);
      suspectedLeaks.push({
        region: `heap_space:${spaceName}`,
        growthPhase1: g1,
        growthPhase2: g2,
        totalGrowth: g1 + g2,
        severity,
        description: formatLeakDescription(spaceName, g1, g2),
      });
    }
  }

  // Sort by severity then total growth
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suspectedLeaks.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      b.totalGrowth - a.totalGrowth,
  );

  const summary = buildSummary(snapshots, suspectedLeaks);

  return {
    snapshots,
    growthPhase1,
    growthPhase2,
    suspectedLeaks,
    summary,
    durationMs: endTime - startTime,
  };
}

/**
 * Check whether a memory region shows sustained growth across both phases.
 */
function isSustainedGrowth(
  baseline: number,
  g1: number,
  g2: number,
  minBytes: number,
  minPercent: number,
): boolean {
  // Both phases must show positive growth above the byte threshold
  if (g1 < minBytes || g2 < minBytes) {
    return false;
  }

  // Both phases must exceed the percentage threshold relative to baseline
  if (baseline === 0) {
    return true; // Growing from zero is always suspicious
  }
  const pct1 = (g1 / baseline) * 100;
  const pct2 = (g2 / (baseline + g1)) * 100;
  return pct1 >= minPercent && pct2 >= minPercent;
}

function formatLeakDescription(region: string, g1: number, g2: number): string {
  const g1MB = bytesToMB(g1).toFixed(1);
  const g2MB = bytesToMB(g2).toFixed(1);
  const totalMB = bytesToMB(g1 + g2).toFixed(1);
  return (
    `${region}: sustained growth detected — ` +
    `+${g1MB} MB (phase 1), +${g2MB} MB (phase 2), ` +
    `${totalMB} MB total`
  );
}

function buildSummary(
  snapshots: [LeakDetectorSnapshot, LeakDetectorSnapshot, LeakDetectorSnapshot],
  leaks: SuspectedLeak[],
): string {
  const heapStartMB = bytesToMB(snapshots[0].heapUsed).toFixed(1);
  const heapEndMB = bytesToMB(snapshots[2].heapUsed).toFixed(1);
  const elapsed = snapshots[2].timestamp - snapshots[0].timestamp;
  const elapsedSec = (elapsed / 1000).toFixed(1);

  if (leaks.length === 0) {
    return (
      `No sustained memory leaks detected. ` +
      `Heap: ${heapStartMB} MB → ${heapEndMB} MB over ${elapsedSec}s.`
    );
  }

  const high = leaks.filter((l) => l.severity === 'high').length;
  const medium = leaks.filter((l) => l.severity === 'medium').length;
  const low = leaks.filter((l) => l.severity === 'low').length;
  const parts: string[] = [];
  if (high > 0) parts.push(`${high} high`);
  if (medium > 0) parts.push(`${medium} medium`);
  if (low > 0) parts.push(`${low} low`);

  return (
    `Detected ${leaks.length} suspected leak(s) [${parts.join(', ')}]. ` +
    `Heap: ${heapStartMB} MB → ${heapEndMB} MB over ${elapsedSec}s.`
  );
}

/**
 * Format a LeakDetectionResult into a human-readable report string.
 */
export function formatLeakReport(result: LeakDetectionResult): string {
  const lines: string[] = [];

  lines.push('=== Three-Snapshot Memory Leak Detection Report ===');
  lines.push('');

  // Snapshot summary table
  lines.push('Snapshots:');
  for (const snap of result.snapshots) {
    const heapMB = bytesToMB(snap.heapUsed).toFixed(1);
    const rssMB = bytesToMB(snap.rss).toFixed(1);
    const time = new Date(snap.timestamp).toISOString();
    lines.push(
      `  #${snap.index}  ${time}  heap: ${heapMB} MB  rss: ${rssMB} MB`,
    );
  }
  lines.push('');

  // Suspected leaks
  if (result.suspectedLeaks.length === 0) {
    lines.push('Result: No sustained memory leaks detected.');
  } else {
    lines.push(`Suspected leaks (${result.suspectedLeaks.length}):`);
    for (const leak of result.suspectedLeaks) {
      lines.push(`  [${leak.severity.toUpperCase()}] ${leak.description}`);
    }
  }

  lines.push('');
  lines.push(result.summary);

  return lines.join('\n');
}
