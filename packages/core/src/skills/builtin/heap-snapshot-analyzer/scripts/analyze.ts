/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Heap Snapshot Analyzer CLI
 *
 * Reads a .heapsnapshot file (streaming for large files), applies noise filtering,
 * and outputs a summary JSON to stdout or a file.
 *
 * Usage:
 *   analyze <snapshot.heapsnapshot> [--output <path>] [--top <n>] [--json]
 */

import * as fs from 'node:fs/promises';
import { parseHeapSnapshotStream } from '../../../shared/streaming-parser.js';
import { analyzeHeapSnapshot } from '../../../shared/perfetto.js';
import {
  NoiseFilter,
  extractFilterNodes,
} from '../../../shared/noise-filter.js';

interface AnalyzeOptions {
  outputPath?: string;
  top: number;
  jsonOnly: boolean;
}

async function analyze(
  snapshotPath: string,
  opts: AnalyzeOptions,
): Promise<void> {
  process.stderr.write(`[analyze] Loading snapshot: ${snapshotPath}\n`);

  const snapshot = await parseHeapSnapshotStream(snapshotPath);

  process.stderr.write(
    `[analyze] Loaded. nodes=${snapshot.nodes.length / snapshot.snapshot.meta.node_fields.length} strings=${snapshot.strings.length}\n`,
  );

  // Run built-in pattern analysis
  const analysis = analyzeHeapSnapshot(snapshot);

  // Apply noise filter to get actionable nodes
  const allNodes = extractFilterNodes(snapshot);
  const filter = new NoiseFilter();
  const actionableNodes = filter.applyAll(allNodes, { sizeThreshold: 64 });

  // Top N by selfSize
  const topNodes = actionableNodes
    .sort((a, b) => b.selfSize - a.selfSize)
    .slice(0, opts.top)
    .map((n) => ({
      nodeId: n.nodeId,
      type: n.type,
      name: n.name,
      selfSize: n.selfSize,
      edgeCount: n.edgeCount,
    }));

  const output = {
    snapshotPath,
    nodeCount: snapshot.snapshot.node_count,
    edgeCount: snapshot.snapshot.edge_count,
    analysis: {
      suspiciousPatterns: analysis.suspiciousPatterns,
      topObjectTypes: analysis.topObjectTypes.slice(0, opts.top),
      potentialLeaks: analysis.potentialLeaks,
    },
    actionableNodes: topNodes,
    filteredNodeCount: actionableNodes.length,
    totalNodeCount: allNodes.length,
  };

  const jsonStr = JSON.stringify(output, null, 2);

  if (opts.outputPath) {
    await fs.writeFile(opts.outputPath, jsonStr, 'utf-8');
    if (!opts.jsonOnly) {
      process.stderr.write(`[analyze] Summary written to ${opts.outputPath}\n`);
    }
  } else {
    process.stdout.write(jsonStr + '\n');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    process.stderr.write(`
Usage: analyze <snapshot.heapsnapshot> [--output <path>] [--top <n>] [--json]

Options:
  --output <path>  Write JSON output to file instead of stdout
  --top <n>        Number of top objects to include (default: 20)
  --json           Suppress informational stderr messages
`);
    process.exit(0);
  }

  const snapshotPath = args[0];
  const outputIdx = args.indexOf('--output');
  const topIdx = args.indexOf('--top');

  const opts: AnalyzeOptions = {
    outputPath: outputIdx > -1 ? args[outputIdx + 1] : undefined,
    top: topIdx > -1 ? parseInt(args[topIdx + 1], 10) : 20,
    jsonOnly: args.includes('--json'),
  };

  await analyze(snapshotPath, opts);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[analyze] Fatal: ${msg}\n`);
    process.exit(1);
  });
}
