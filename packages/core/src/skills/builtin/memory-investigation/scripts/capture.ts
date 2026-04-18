/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * capture.ts — CDP Heap Snapshot Capturer
 *
 * Connects to the current Node.js process via inspector.Session,
 * triggers HeapProfiler.takeHeapSnapshot at timed intervals,
 * and streams snapshot data to disk.
 *
 * Zero external dependencies. Uses built-in node:inspector/promises.
 */

import inspector from 'node:inspector';
import fs from 'node:fs';
import path from 'node:path';
import type { CaptureOptions, SnapshotResult } from './types.js';

/**
 * Capture a single heap snapshot from the current process.
 */
export function takeSnapshot(
  session: inspector.Session,
  outputPath: string,
): Promise<SnapshotResult> {
  return new Promise((resolve, reject) => {
    let chunks: string[] | null = [];
    let totalSize = 0;

    const onChunk = (message: inspector.InspectorNotification<{ chunk: string }>): void => {
      const chunk = message.params.chunk;
      chunks!.push(chunk);
      totalSize += chunk.length;
    };

    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);

    session.post('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
      treatGlobalObjectsAsRoots: true,
      captureNumericValue: false,
    }, (err: Error | null) => {
      session.removeListener('HeapProfiler.addHeapSnapshotChunk', onChunk);

      if (err) {
        reject(new Error(`Snapshot capture failed: ${err.message}`));
        return;
      }

      try {
        const snapshotData = chunks!.join('');
        chunks = null; // free memory
        fs.writeFileSync(outputPath, snapshotData);
        resolve({
          path: path.resolve(outputPath),
          sizeBytes: totalSize,
        });
      } catch (writeErr) {
        reject(new Error(`Failed to write snapshot: ${(writeErr as Error).message}`));
      }
    });
  });
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Capture multiple heap snapshots at timed intervals.
 */
export async function captureSnapshots(options: CaptureOptions = {}): Promise<string[]> {
  const {
    count = 3,
    intervalMs = 5000,
    outputDir = './snapshots',
  } = options;

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Connect inspector session
  const session = new inspector.Session();
  session.connect();

  // Enable HeapProfiler domain
  session.post('HeapProfiler.enable');

  const snapshotPaths: string[] = [];

  try {
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        process.stdout.write(`  Waiting ${intervalMs / 1000}s before next capture...\r`);
        await sleep(intervalMs);
      }

      const filename = path.join(outputDir, `snapshot_${i}.heapsnapshot`);

      process.stdout.write(`  Capturing snapshot ${i + 1}/${count}...            \r`);
      const result = await takeSnapshot(session, filename);
      snapshotPaths.push(result.path);

      console.log(`  Snapshot ${i + 1}/${count}: ${formatBytes(result.sizeBytes)} -> ${result.path}`);
    }
  } finally {
    // Always cleanup
    session.post('HeapProfiler.disable');
    session.disconnect();
  }

  return snapshotPaths;
}

/**
 * Run as standalone CLI tool.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let count = 3;
  let intervalMs = 5000;
  let outputDir = './snapshots';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) count = parseInt(args[++i], 10);
    else if (args[i] === '--interval' && args[i + 1]) intervalMs = parseInt(args[++i], 10);
    else if (args[i] === '--output' && args[i + 1]) outputDir = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: node capture.js [--count N] [--interval MS] [--output DIR]');
      process.exit(0);
    }
  }

  console.log(`Capturing ${count} snapshots at ${intervalMs}ms intervals -> ${outputDir}/`);
  const paths = await captureSnapshots({ count, intervalMs, outputDir });
  console.log(`\nDone. ${paths.length} snapshots captured.`);
}

// Run as CLI if executed directly
const scriptPath = process.argv[1];
const modulePath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
if (scriptPath && path.resolve(scriptPath) === path.resolve(modulePath)) {
  main().catch((err: Error) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
