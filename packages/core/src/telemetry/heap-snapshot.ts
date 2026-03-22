/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bytesToMB } from '../utils/formatters.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Metadata about a captured heap snapshot.
 */
export interface HeapSnapshotResult {
  /** Absolute path to the .heapsnapshot file. */
  filePath: string;
  /** Timestamp (ms since epoch) when the snapshot was captured. */
  timestamp: number;
  /** Heap used (bytes) at the time of capture. */
  heapUsedBytes: number;
  /** Heap total (bytes) at the time of capture. */
  heapTotalBytes: number;
  /** RSS (bytes) at the time of capture. */
  rssBytes: number;
  /** Duration (ms) it took to write the snapshot. */
  durationMs: number;
  /** Size of the snapshot file in bytes. */
  fileSizeBytes: number;
}

/**
 * Options for capturing a heap snapshot.
 */
export interface HeapSnapshotOptions {
  /**
   * Directory to write the snapshot file to.
   * Defaults to `os.tmpdir()`.
   */
  outputDir?: string;
  /**
   * Optional tag to include in the filename for identification
   * (e.g., "before-gc", "after-tool-call").
   */
  tag?: string;
}

/**
 * Captures a V8 heap snapshot and writes it to disk.
 *
 * The snapshot is saved as a `.heapsnapshot` file that can be loaded in
 * Chrome DevTools (Memory tab) or other V8 heap analysis tools.
 *
 * @param options - Configuration for the snapshot capture.
 * @returns Metadata about the captured snapshot, or `null` if the capture failed.
 */
export function captureHeapSnapshot(
  options: HeapSnapshotOptions = {},
): HeapSnapshotResult | null {
  const { outputDir = os.tmpdir(), tag } = options;

  // Validate the output directory exists
  if (!fs.existsSync(outputDir)) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      debugLogger.error(
        `[HEAP-SNAPSHOT] Failed to create output directory: ${outputDir}`,
        err,
      );
      return null;
    }
  }

  // Build the filename: gemini-heap-<timestamp>[-<tag>].heapsnapshot
  const timestamp = Date.now();
  const tagSuffix = tag ? `-${tag.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const filename = `gemini-heap-${timestamp}${tagSuffix}.heapsnapshot`;
  const filePath = path.join(outputDir, filename);

  // Record memory state before capture
  const memBefore = process.memoryUsage();
  const startTime = performance.now();

  try {
    // v8.writeHeapSnapshot writes the current V8 heap to a file and returns
    // the filename it actually wrote (which may differ from what was requested
    // on some platforms).
    const actualPath = v8.writeHeapSnapshot(filePath);
    const durationMs = Math.round(performance.now() - startTime);
    const resolvedPath = actualPath || filePath;

    let fileSizeBytes = 0;
    try {
      const stat = fs.statSync(resolvedPath);
      fileSizeBytes = stat.size;
    } catch {
      // Non-critical: file size is informational only
    }

    const result: HeapSnapshotResult = {
      filePath: resolvedPath,
      timestamp,
      heapUsedBytes: memBefore.heapUsed,
      heapTotalBytes: memBefore.heapTotal,
      rssBytes: memBefore.rss,
      durationMs,
      fileSizeBytes,
    };

    debugLogger.debug(
      `[HEAP-SNAPSHOT] Captured snapshot: ${resolvedPath} ` +
        `(${bytesToMB(fileSizeBytes).toFixed(1)} MB, took ${durationMs}ms)`,
    );

    return result;
  } catch (err) {
    debugLogger.error('[HEAP-SNAPSHOT] Failed to capture heap snapshot', err);
    return null;
  }
}

/**
 * Formats a HeapSnapshotResult into a human-readable summary string.
 */
export function formatSnapshotSummary(result: HeapSnapshotResult): string {
  const lines = [
    `Heap snapshot saved to: ${result.filePath}`,
    `  Capture time: ${new Date(result.timestamp).toISOString()}`,
    `  Heap used:    ${bytesToMB(result.heapUsedBytes).toFixed(1)} MB`,
    `  Heap total:   ${bytesToMB(result.heapTotalBytes).toFixed(1)} MB`,
    `  RSS:          ${bytesToMB(result.rssBytes).toFixed(1)} MB`,
    `  File size:    ${bytesToMB(result.fileSizeBytes).toFixed(1)} MB`,
    `  Duration:     ${result.durationMs} ms`,
    '',
    'Open in Chrome DevTools → Memory tab → Load to analyze.',
  ];
  return lines.join('\n');
}
