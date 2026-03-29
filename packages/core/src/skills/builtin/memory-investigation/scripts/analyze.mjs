/**
 * analyze.mjs — Memory Investigation Orchestrator
 *
 * Runs the complete memory investigation pipeline:
 * 1. Capture 3 heap snapshots at configurable intervals
 * 2. Parse and diff snapshots offline
 * 3. Walk retainer chains for top anomalies
 * 4. Render terminal report with retainer paths
 * 5. Write compact JSON summary for LLM consumption
 * 6. Generate Perfetto-compatible trace
 *
 * Usage: node analyze.mjs [snapshot_dir] [--interval MS] [--top K]
 *
 * Zero external dependencies. Requires Node.js >= 20.
 *
 * @license Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseSnapshot, diffSnapshots } from './diff.mjs';
import { walkRetainers } from './retainers.mjs';
import { renderTable, renderRetainerPaths } from './render.mjs';
import { convertToTraceEvents } from './trace.mjs';
import { captureSnapshots } from './capture.mjs';

async function main() {
  const args = process.argv.slice(2);
  let snapshotDir = args[0] || './snapshots';
  let intervalMs = 5000;
  let topK = 15;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--interval' && args[i + 1]) intervalMs = parseInt(args[++i], 10);
    if (args[i] === '--top' && args[i + 1]) topK = parseInt(args[++i], 10);
    if (args[i] === '--help') {
      console.log('Usage: node analyze.mjs [snapshot_dir] [--interval MS] [--top K]');
      process.exit(0);
    }
  }

  const startTime = Date.now();
  console.log('');
  console.log('Memory Investigation — Capture + Analysis Pipeline');
  console.log('');

  // Step 1: Capture
  console.log('Step 1: Capturing 3 heap snapshots...');
  const snapshotPaths = await captureSnapshots({ count: 3, intervalMs, outputDir: snapshotDir });
  console.log('');

  // Step 2: Parse and diff
  console.log('Step 2: Parsing and diffing snapshots...');
  const map0 = parseSnapshot(snapshotPaths[0]);
  const map2 = parseSnapshot(snapshotPaths[2]);
  const diffs = diffSnapshots(map0, map2, { topK });
  console.log(`  ${diffs.length} anomalies detected.`);
  console.log('');

  // Step 3: Retainer chains
  console.log('Step 3: Walking retainer chains...');
  const latestRaw = JSON.parse(fs.readFileSync(snapshotPaths[2], 'utf-8'));
  const topNames = diffs.filter(d => d.sizeDelta > 0).slice(0, 5).map(d => d.name);
  const retainerResults = topNames.length > 0
    ? walkRetainers(latestRaw, topNames, { maxDepth: 5, maxChainsPerType: 2 })
    : [];
  console.log('');

  // Step 4: Render
  const totalTimeMs = Date.now() - startTime;
  renderTable(diffs, { snapshot1: snapshotPaths[0], snapshot2: snapshotPaths[2], totalCaptures: 3, totalTimeMs });
  renderRetainerPaths(retainerResults);

  // Step 5: JSON summary
  const summary = {
    tool: 'memory-investigation',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    nodeVersion: process.versions.node,
    v8Version: process.versions.v8,
    snapshots: { count: 3, intervalMs, paths: snapshotPaths },
    analysis: { snapshot1_constructors: map0.size, snapshot2_constructors: map2.size, topK, noiseFloorBytes: 1024 },
    anomalies: diffs,
    retainer_chains: retainerResults,
  };
  const jsonPath = path.join(snapshotDir, 'diff_summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  console.log(`JSON summary -> ${jsonPath}`);

  // Step 6: Perfetto trace
  const traceData = convertToTraceEvents(summary);
  const tracePath = path.join(snapshotDir, 'trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(traceData, null, 2));
  console.log(`Perfetto trace -> ${tracePath}`);
  console.log(`Open in: https://ui.perfetto.dev/`);
  console.log('');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s.`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
