#!/usr/bin/env node
/**
 * perfetto_export.js
 * Converts Node.js heap snapshots and CPU profiles into Perfetto trace format.
 * Output can be loaded in https://ui.perfetto.dev
 *
 * Usage:
 *   node perfetto_export.js --heap <snapshot.heapsnapshot>
 *   node perfetto_export.js --cpu <profile.cpuprofile>
 *   node perfetto_export.js --heap <snap.heapsnapshot> --cpu <prof.cpuprofile>
 *
 * Output: <filename>.perfetto-trace (JSON format compatible with ui.perfetto.dev)
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const heapFile = getArg('--heap');
const cpuFile = getArg('--cpu');
const outputDir = getArg('--output') || process.cwd();

if (!heapFile && !cpuFile) {
  console.error('Usage: node perfetto_export.js [--heap <file>] [--cpu <file>]');
  process.exit(1);
}

// ── Perfetto JSON Trace Format ────────────────────────────────────────────────
// Uses the Trace Event Format (chrome://tracing compatible)
// Reference: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU

function createTrace() {
  return {
    traceEvents: [],
    metadata: {
      'clock-domain': 'MONOTONIC',
      'source': 'gemini-cli-memory-analyzer',
    },
    displayTimeUnit: 'ms',
  };
}

// ── Heap Snapshot → Perfetto ──────────────────────────────────────────────────

function convertHeapSnapshot(filePath, trace) {
  console.log(`Loading heap snapshot: ${path.basename(filePath)}`);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));

  const meta = raw.snapshot.meta;
  const nodeFields = meta.node_fields;
  const nodeTypes = meta.node_types[0];
  const nodeFieldCount = nodeFields.length;
  const F = Object.fromEntries(nodeFields.map((f, i) => [f, i]));
  const nodes = raw.nodes;
  const strings = raw.strings;
  const nodeCount = raw.snapshot.node_count;

  // Aggregate by class for memory breakdown counter track
  const byClass = new Map();
  let totalSize = 0;

  for (let i = 0; i < nodeCount; i++) {
    const base = i * nodeFieldCount;
    const type = nodeTypes[nodes[base + F.type]] || 'unknown';
    const name = strings[nodes[base + F.name]];
    const selfSize = nodes[base + F.self_size];
    totalSize += selfSize;

    const key = (type === 'object' || type === 'closure') ? `${type}:${name}` : type;
    if (!byClass.has(key)) byClass.set(key, 0);
    byClass.set(key, byClass.get(key) + selfSize);
  }

  // Sort by size
  const sorted = [...byClass.entries()].sort((a, b) => b[1] - a[1]);

  // Create a counter track event for each top class
  const ts = 0; // timestamp in microseconds
  const pid = 1;
  const topN = sorted.slice(0, 20);

  // Memory totals as instant event
  trace.traceEvents.push({
    name: 'HeapSnapshot',
    ph: 'i', // instant
    ts,
    pid,
    tid: 1,
    s: 'g',
    args: {
      'file': path.basename(filePath),
      'total_size_mb': (totalSize / 1024 / 1024).toFixed(2),
      'node_count': nodeCount,
    }
  });

  // Top memory consumers as counter events
  topN.forEach(([cls, size], idx) => {
    trace.traceEvents.push({
      name: cls,
      ph: 'C', // counter
      ts: ts + idx,
      pid,
      tid: 1,
      args: {
        'size_kb': Math.round(size / 1024),
        'size_mb': (size / 1024 / 1024).toFixed(3),
      }
    });
  });

  // Top allocations as flow events for visualization
  topN.slice(0, 10).forEach(([cls, size], idx) => {
    const pct = ((size / totalSize) * 100).toFixed(1);
    // Duration event to show as flame-style bar
    trace.traceEvents.push({
      name: `${cls} (${pct}%)`,
      ph: 'X', // complete (duration)
      ts: idx * 1000,
      dur: Math.max(1, Math.round(size / 1024)), // width proportional to size
      pid,
      tid: idx + 1,
      args: {
        'size': `${(size / 1024 / 1024).toFixed(2)} MB`,
        'count': byClass.get(cls) || 0,
      }
    });
  });

  console.log(`  ✓ Converted ${nodeCount.toLocaleString()} nodes, total ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  return totalSize;
}

// ── CPU Profile → Perfetto ────────────────────────────────────────────────────

function convertCpuProfile(filePath, trace) {
  console.log(`Loading CPU profile: ${path.basename(filePath)}`);
  const profile = JSON.parse(readFileSync(filePath, 'utf8'));

  const pid = 2;
  const tid = 1;

  // Build node map
  const nodeMap = new Map();
  function indexNodes(node) {
    nodeMap.set(node.id, node);
    if (node.children) node.children.forEach(indexNodes);
  }
  indexNodes(profile.head);

  if (!profile.samples || profile.samples.length === 0) {
    console.log('  ⚠ No samples in profile, skipping CPU conversion');
    return;
  }

  const startTime = profile.startTime || 0;
  const timeDeltas = profile.timeDeltas || [];
  let currentTime = startTime;

  // Convert each sample to a trace event
  for (let i = 0; i < profile.samples.length; i++) {
    const nodeId = profile.samples[i];
    const node = nodeMap.get(nodeId);
    const delta = timeDeltas[i] || 1000;

    if (!node) continue;

    const fn = node.callFrame.functionName || '(anonymous)';
    const url = node.callFrame.url || '';
    const line = node.callFrame.lineNumber || 0;
    const shortUrl = url.replace(/.*\//, '').slice(0, 40);

    trace.traceEvents.push({
      name: fn,
      ph: 'X', // complete event
      ts: (currentTime - startTime) / 1000, // µs → ms
      dur: delta / 1000,
      pid,
      tid,
      args: {
        'file': shortUrl,
        'line': line,
      }
    });

    currentTime += delta;
  }

  const totalMs = (currentTime - startTime) / 1000000;
  console.log(`  ✓ Converted ${profile.samples.length.toLocaleString()} samples, ${totalMs.toFixed(2)}s duration`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const trace = createTrace();
const parts = [];

if (heapFile) {
  convertHeapSnapshot(heapFile, trace);
  parts.push(path.basename(heapFile, '.heapsnapshot'));
}

if (cpuFile) {
  convertCpuProfile(cpuFile, trace);
  parts.push(path.basename(cpuFile, '.cpuprofile'));
}

const outputName = `perfetto-${parts.join('+')}-${Date.now()}.json`;
const outputPath = path.join(outputDir, outputName);

writeFileSync(outputPath, JSON.stringify(trace, null, 2));

console.log(`\n✅ Perfetto trace exported: ${outputPath}`);
console.log('\nTo view:');
console.log('  1. Open https://ui.perfetto.dev');
console.log('  2. Click "Open trace file"');
console.log(`  3. Select: ${outputName}`);
console.log('\nNote: For richer visualization, also load the raw .heapsnapshot');
console.log('  in Chrome DevTools → Memory tab');
