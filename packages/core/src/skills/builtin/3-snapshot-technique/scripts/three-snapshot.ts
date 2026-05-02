/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Enhanced 3-Snapshot Leak Detection Engine
 *
 * Uses DiffEngine for formal analysis, NoiseFilter before diff,
 * and optionally generates a Perfetto trace.
 *
 * Usage:
 *   three-snapshot --s1 <path> --s2 <path> --s3 <path>
 *                  [--output <dir>] [--depth <n>] [--perfetto]
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseHeapSnapshotStream } from '../../../shared/streaming-parser.js';
import { DiffEngine } from '../../../shared/diff-engine.js';
import {
  NoiseFilter,
  extractFilterNodes,
  buildNodeIdSet,
} from '../../../shared/noise-filter.js';
import { PerfettoTraceBuilder } from '../../../shared/perfetto.js';

interface ThreeSnapshotOptions {
  s1Path: string;
  s2Path: string;
  s3Path: string;
  outputDir: string;
  depth: number;
  perfetto: boolean;
}

async function runThreeSnapshot(opts: ThreeSnapshotOptions): Promise<void> {
  process.stderr.write('[three-snapshot] Loading snapshots...\n');

  const [s1Raw, s2Raw, s3Raw] = await Promise.all([
    parseHeapSnapshotStream(opts.s1Path),
    parseHeapSnapshotStream(opts.s2Path),
    parseHeapSnapshotStream(opts.s3Path),
  ]);

  process.stderr.write('[three-snapshot] Applying noise filters...\n');

  // Apply noise filter to S3 candidates only (filter before diff)
  const s2Ids = buildNodeIdSet(s2Raw);
  const s3Nodes = extractFilterNodes(s3Raw);
  const filter = new NoiseFilter();
  const filteredS3Nodes = filter.applyAll(s3Nodes, {
    s2Ids,
    sizeThreshold: 64,
  });

  // Build a filtered snapshot view: keep only filtered node IDs
  const filteredS3NodeIds = new Set(filteredS3Nodes.map((n) => n.nodeId));

  // Rebuild a trimmed S3 for the diff engine (still needs full structure for retainer chains)
  // We pass the originals to DiffEngine but it only reports candidates that passed the noise filter
  process.stderr.write('[three-snapshot] Running diff analysis...\n');

  const engine = new DiffEngine();
  const leakReport = engine.analyzeThreeSnapshots(s1Raw, s2Raw, s3Raw, {
    maxRetainerDepth: opts.depth,
    maxCandidates: 50,
  });

  // Post-filter candidates through noise filter results
  leakReport.candidates = leakReport.candidates.filter((c) =>
    filteredS3NodeIds.has(c.nodeId),
  );

  process.stderr.write(
    `[three-snapshot] Found ${leakReport.candidates.length} leak candidates. Total leaked: ${leakReport.totalLeakedBytes} bytes\n`,
  );

  // Ensure output directory exists
  await fs.mkdir(opts.outputDir, { recursive: true });

  // Write leak report JSON
  const reportPath = path.join(opts.outputDir, 'leak-report.json');
  await fs.writeFile(reportPath, JSON.stringify(leakReport, null, 2), 'utf-8');
  process.stderr.write(
    `[three-snapshot] Leak report written to ${reportPath}\n`,
  );

  // Optionally generate Perfetto trace
  if (opts.perfetto) {
    const builder = new PerfettoTraceBuilder();
    builder.addLeakReport(leakReport);
    const tracePath = path.join(opts.outputDir, 'leak-trace.json');
    await builder.saveToFile(tracePath);
    process.stderr.write(
      `[three-snapshot] Perfetto trace written to ${tracePath}\n`,
    );
  }

  // Print summary to stdout
  const summary = {
    totalLeakedBytes: leakReport.totalLeakedBytes,
    candidateCount: leakReport.candidates.length,
    snapshotSizes: leakReport.snapshotSizes,
    top5: leakReport.candidates.slice(0, 5).map((c) => ({
      constructor: c.constructorName,
      count: c.count,
      deltaSizeBytes: c.retainedSizeDelta,
      confidence: c.confidence,
    })),
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx > -1 ? args[idx + 1] : undefined;
  };

  const s1Path = getArg('--s1');
  const s2Path = getArg('--s2');
  const s3Path = getArg('--s3');

  if (!s1Path || !s2Path || !s3Path) {
    process.stderr.write(`
Usage: three-snapshot --s1 <path> --s2 <path> --s3 <path>
                      [--output <dir>] [--depth <n>] [--perfetto]

Options:
  --s1 <path>      Path to snapshot 1 (baseline)
  --s2 <path>      Path to snapshot 2 (after workload)
  --s3 <path>      Path to snapshot 3 (after GC)
  --output <dir>   Output directory for reports (default: ./output)
  --depth <n>      Retainer chain depth (default: 5)
  --perfetto       Also generate a Perfetto trace file
`);
    process.exit(1);
  }

  await runThreeSnapshot({
    s1Path,
    s2Path,
    s3Path,
    outputDir: getArg('--output') ?? './output',
    depth: parseInt(getArg('--depth') ?? '5', 10),
    perfetto: args.includes('--perfetto'),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[three-snapshot] Fatal: ${msg}\n`);
    process.exit(1);
  });
}
