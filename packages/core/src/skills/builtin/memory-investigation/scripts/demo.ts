/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * demo.ts — Self-Contained Heapsnapshot POC Demo
 *
 * Single-command demonstration:
 * 1. Creates a realistic multi-type memory leak
 * 2. Captures 3 heap snapshots at timed intervals
 * 3. Parses and diffs the snapshots offline
 * 4. Renders a color-coded growth analysis table
 * 5. Writes a compact JSON summary for LLM consumption
 * 6. Generates a Perfetto-compatible trace file
 *
 * Usage: node demo.js
 *
 * Zero external dependencies. Requires Node.js >= 20.
 */

import { parseSnapshot, diffSnapshots } from './diff.js';
import { renderTable, renderRetainerPaths } from './render.js';
import { convertToTraceEvents } from './trace.js';
import { walkRetainers } from './retainers.js';
import fs from 'node:fs';
import path from 'node:path';
import type { HeapSnapshot, RetainerResult } from './types.js';

// ANSI codes for header
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

// ──────────────────────────────────────────────────────────────
// PHASE 0: Intentional Memory Leak (Realistic Multi-Type Pattern)
// ──────────────────────────────────────────────────────────────

interface RequestContext {
  id: number;
  timestamp: number;
  payload: Buffer;
  metadata: {
    headers: Record<string, string>;
    traceData: string;
  };
  responseCache: Array<{ chunk: number; data: string }>;
}

const leakedContexts = new Map<number, RequestContext>();
let requestId = 0;

function simulateLeakyRequest(): void {
  const ctx: RequestContext = {
    id: requestId++,
    timestamp: Date.now(),
    payload: Buffer.alloc(1024, 'x'),
    metadata: {
      headers: { 'x-request-id': `req-${requestId}` },
      traceData: 'trace-context-propagation-'.repeat(20),
    },
    responseCache: new Array(10).fill(null).map((_, i) => ({
      chunk: i,
      data: `response-data-block-${i}-`.repeat(5),
    })),
  };
  leakedContexts.set(ctx.id, ctx);
}

// Leak rate: how many requests to simulate between each snapshot
const LEAK_BATCH_SIZE = 5000;

function runLeakBatch(): void {
  for (let i = 0; i < LEAK_BATCH_SIZE; i++) {
    simulateLeakyRequest();
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN DEMO FLOW
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('');
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   Heapsnapshot POC — Memory Leak Detection Demo     ║${RESET}`);
  console.log(`${BOLD}${CYAN}║   GSoC 2026: Issue #23365                           ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}`);
  console.log('');

  const outputDir = './snapshots';
  const intervalMs = 3000;
  const snapshotCount = 3;

  // Check Node.js version
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion < 20) {
    console.error(`Error: Node.js >= 20 required (current: ${process.versions.node})`);
    process.exit(1);
  }

  console.log(`${DIM}Node.js ${process.versions.node} | V8 ${process.versions.v8}${RESET}`);
  console.log(`${DIM}Snapshot interval: ${intervalMs / 1000}s | Count: ${snapshotCount}${RESET}`);
  console.log('');

  // ── Step 1: Create initial leak baseline ──
  console.log(`${YELLOW}Step 1:${RESET} Creating initial memory pressure (${LEAK_BATCH_SIZE} leaked objects)...`);
  runLeakBatch();
  console.log(`  Leaked ${leakedContexts.size} RequestContext objects so far.`);
  console.log('');

  // ── Step 2: Capture snapshots with leak growth between each ──
  console.log(`${YELLOW}Step 2:${RESET} Capturing ${snapshotCount} heap snapshots...`);
  console.log('');

  fs.mkdirSync(outputDir, { recursive: true });

  const snapshotPaths: string[] = [];

  // Capture snapshot 0 (baseline after initial leak)
  const { captureOne } = await importCaptureHelpers();
  snapshotPaths.push(await captureOne(outputDir, 0, snapshotCount));

  // Leak more, then capture snapshot 1
  console.log(`${DIM}  Leaking ${LEAK_BATCH_SIZE} more objects...${RESET}`);
  runLeakBatch();
  await sleep(intervalMs);
  snapshotPaths.push(await captureOne(outputDir, 1, snapshotCount));

  // Leak more, then capture snapshot 2
  console.log(`${DIM}  Leaking ${LEAK_BATCH_SIZE} more objects...${RESET}`);
  runLeakBatch();
  await sleep(intervalMs);
  snapshotPaths.push(await captureOne(outputDir, 2, snapshotCount));

  console.log('');
  console.log(`  Total leaked objects: ${leakedContexts.size}`);
  console.log('');

  // ── Step 3: Parse and diff snapshots (OFFLINE — outside LLM context) ──
  console.log(`${YELLOW}Step 3:${RESET} Parsing snapshots and computing diff...`);
  console.log('');

  const map0 = parseSnapshot(snapshotPaths[0]);
  const map2 = parseSnapshot(snapshotPaths[2]);

  console.log(`  Snapshot 0: ${map0.size} unique constructors`);
  console.log(`  Snapshot 2: ${map2.size} unique constructors`);
  console.log('');

  const diffs = diffSnapshots(map0, map2, { topK: 15 });

  // ── Step 3b: Walk retainer chains for top anomalies ──
  console.log(`${YELLOW}Step 3b:${RESET} Walking retainer chains for top anomalies...`);
  console.log('');

  // Parse latest snapshot as raw JSON for retainer analysis
  const latestRaw: HeapSnapshot = JSON.parse(fs.readFileSync(snapshotPaths[2], 'utf-8'));
  const topAnomalyNames = diffs.filter(d => d.sizeDelta > 0).slice(0, 5).map(d => d.name);
  let retainerResults: RetainerResult[] = [];
  if (topAnomalyNames.length > 0) {
    retainerResults = walkRetainers(latestRaw, topAnomalyNames, { maxDepth: 5, maxChainsPerType: 2 });
    console.log(`  Analyzed ${topAnomalyNames.length} anomaly type(s) for retainer chains.`);
  } else {
    console.log(`  No growing anomalies to analyze.`);
  }
  console.log('');

  // ── Step 4: Render results ──
  console.log(`${YELLOW}Step 4:${RESET} Rendering analysis results...`);

  const totalTimeMs = Date.now() - startTime;
  renderTable(diffs, {
    snapshot1: snapshotPaths[0],
    snapshot2: snapshotPaths[2],
    totalCaptures: snapshotCount,
    totalTimeMs,
  });

  // Render retainer paths
  renderRetainerPaths(retainerResults);

  // ── Step 5: Write JSON summary (for LLM consumption) ──
  console.log(`${YELLOW}Step 5:${RESET} Writing compact JSON summary for LLM consumption...`);
  console.log('');

  const jsonSummary = {
    tool: 'heapsnapshot-poc',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    nodeVersion: process.versions.node,
    v8Version: process.versions.v8,
    snapshots: {
      count: snapshotCount,
      intervalMs,
      paths: snapshotPaths,
    },
    analysis: {
      snapshot1_constructors: map0.size,
      snapshot2_constructors: map2.size,
      topK: 15,
      noiseFloorBytes: 1024,
      totalLeakedObjects: leakedContexts.size,
    },
    anomalies: diffs,
    retainer_chains: retainerResults,
  };

  const jsonPath = path.join(outputDir, 'diff_summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonSummary, null, 2));
  console.log(`${DIM}JSON summary written to: ${jsonPath}${RESET}`);
  console.log(`${DIM}(This compact summary is what would be fed to the LLM for root-cause analysis)${RESET}`);
  console.log('');

  // ── Step 6: Generate Perfetto-compatible trace ──
  console.log(`${YELLOW}Step 6:${RESET} Generating Perfetto trace...`);

  const traceData = convertToTraceEvents(jsonSummary);
  const tracePath = path.join(outputDir, 'trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(traceData, null, 2));

  const eventCount = traceData.traceEvents.length;
  console.log(`  ${eventCount} trace events -> ${tracePath}`);
  console.log(`  ${DIM}Open in: ${CYAN}https://ui.perfetto.dev/${RESET}${DIM} (drag and drop trace.json)${RESET}`);
  console.log('');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${BOLD}${CYAN}Done in ${elapsed}s.${RESET}`);
  console.log('');
}

/**
 * Import capture helpers for individual snapshot capture.
 */
async function importCaptureHelpers(): Promise<{
  captureOne: (outputDir: string, index: number, total: number) => Promise<string>;
}> {
  const inspector = await import('node:inspector');

  const session = new inspector.default.Session();
  session.connect();
  session.post('HeapProfiler.enable');

  async function captureOne(outputDir: string, index: number, total: number): Promise<string> {
    const filename = path.join(outputDir, `snapshot_${index}.heapsnapshot`);
    process.stdout.write(`  Capturing snapshot ${index + 1}/${total}...`);

    return new Promise<string>((resolve, reject) => {
      let chunks: string[] | null = [];

      const onChunk = (message: { params: { chunk: string } }): void => {
        chunks!.push(message.params.chunk);
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

        const snapshotData = chunks!.join('');
        const sizeBytes = snapshotData.length;
        chunks = null;
        fs.writeFileSync(filename, snapshotData);

        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
        const absPath = path.resolve(filename);
        console.log(` ${sizeMB} MB -> ${absPath}`);

        resolve(absPath);
      });
    });
  }

  // Register cleanup
  process.on('exit', () => {
    try {
      session.post('HeapProfiler.disable');
      session.disconnect();
    } catch { /* ignore cleanup errors */ }
  });

  return { captureOne };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── ENTRY POINT ──
main().catch((err: Error) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
