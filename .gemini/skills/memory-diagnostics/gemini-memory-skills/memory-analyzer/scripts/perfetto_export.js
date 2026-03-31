#!/usr/bin/env node

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

  const sorted = [...byClass.entries()].sort((a, b) => b[1] - a[1]);

  const ts = 0;
  const pid = 1;
  const topN = sorted.slice(0, 20);

  trace.traceEvents.push({
    name: 'HeapSnapshot',
    ph: 'i',
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

  topN.forEach(([cls, size], idx) => {
    trace.traceEvents.push({
      name: cls,
      ph: 'C',
      ts: ts + idx,
      pid,
      tid: 1,
      args: {
        'size_kb': Math.round(size / 1024),
        'size_mb': (size / 1024 / 1024).toFixed(3),
      }
    });
  });

  topN.slice(0, 10).forEach(([cls, size], idx) => {
    const pct = ((size / totalSize) * 100).toFixed(1);
    trace.traceEvents.push({
      name: `${cls} (${pct}%)`,
      ph: 'X',
      ts: idx * 1000,
      dur: Math.max(1, Math.round(size / 1024)),
      pid,
      tid: idx + 1,
      args: {
        'size': `${(size / 1024 / 1024).toFixed(2)} MB`,
        'count': byClass.get(cls) || 0,
      }
    });
  });

  console.log(`  Converted ${nodeCount.toLocaleString()} nodes, total ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  return totalSize;
}

function convertCpuProfile(filePath, trace) {
  console.log(`Loading CPU profile: ${path.basename(filePath)}`);
  const profile = JSON.parse(readFileSync(filePath, 'utf8'));

  const pid = 2;
  const tid = 1;

  const nodeMap = new Map();
  function indexNodes(node) {
    nodeMap.set(node.id, node);
    if (node.children) node.children.forEach(indexNodes);
  }
  indexNodes(profile.head);

  if (!profile.samples || profile.samples.length === 0) {
    console.log('  No samples in profile, skipping CPU conversion');
    return;
  }

  const startTime = profile.startTime || 0;
  const timeDeltas = profile.timeDeltas || [];
  let currentTime = startTime;

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
      ph: 'X',
      ts: (currentTime - startTime) / 1000,
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
  console.log(`  Converted ${profile.samples.length.toLocaleString()} samples, ${totalMs.toFixed(2)}s duration`);
}

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

console.log(`\nPerfetto trace exported: ${outputPath}`);
console.log('\nTo view:');
console.log('  1. Open https://ui.perfetto.dev');
console.log('  2. Click "Open trace file"');
console.log(`  3. Select: ${outputName}`);
console.log('\nNote: For richer visualization, also load the raw .heapsnapshot');
console.log('  in Chrome DevTools → Memory tab');