#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const files = args.filter(a => !a.startsWith('--'));

if (files.length === 0) {
  console.error('Usage: node analyze_snapshot.js <snapshot.heapsnapshot> [snapshot2.heapsnapshot]');
  process.exit(1);
}

function parseSnapshot(filePath) {
  console.error(`Loading ${path.basename(filePath)}...`);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));

  const meta = raw.snapshot.meta;
  const nodeFields = meta.node_fields;
  const nodeTypes = meta.node_types[0];
  const edgeFields = meta.edge_fields;
  const edgeTypes = meta.edge_types[0];

  const nodeCount = raw.snapshot.node_count;
  const edgeCount = raw.snapshot.edge_count;
  const nodeFieldCount = nodeFields.length;
  const edgeFieldCount = edgeFields.length;

  const nodes = raw.nodes;
  const edges = raw.edges;
  const strings = raw.strings;

  const F = Object.fromEntries(nodeFields.map((f, i) => [f, i]));
  const EF = Object.fromEntries(edgeFields.map((f, i) => [f, i]));

  const nodeList = [];
  for (let i = 0; i < nodeCount; i++) {
    const base = i * nodeFieldCount;
    nodeList.push({
      type: nodeTypes[nodes[base + F.type]] || 'unknown',
      name: strings[nodes[base + F.name]],
      id: nodes[base + F.id],
      selfSize: nodes[base + F.self_size],
      edgeCount: nodes[base + F.edge_count],
      detachedness: nodes[base + (F.detachedness ?? -1)] ?? 0,
      nodeIndex: i,
    });
  }

  const byClass = new Map();
  for (const node of nodeList) {
    const key = node.type === 'object' || node.type === 'closure' || node.type === 'regexp'
      ? `${node.type}:${node.name}`
      : node.type;
    if (!byClass.has(key)) byClass.set(key, { key, count: 0, selfSize: 0, type: node.type, name: node.name });
    const entry = byClass.get(key);
    entry.count++;
    entry.selfSize += node.selfSize;
  }

  const detached = nodeList.filter(n => n.detachedness === 1);

  const largeObjects = nodeList
    .filter(n => n.selfSize > 100 * 1024)
    .sort((a, b) => b.selfSize - a.selfSize)
    .slice(0, 20);

  const topBySize = [...byClass.values()]
    .sort((a, b) => b.selfSize - a.selfSize)
    .slice(0, 30);

  const topByCount = [...byClass.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const totalSize = nodeList.reduce((s, n) => s + n.selfSize, 0);

  return {
    filePath,
    fileName: path.basename(filePath),
    nodeCount,
    edgeCount,
    totalSize,
    byClass,
    topBySize,
    topByCount,
    detached,
    largeObjects,
    nodeList,
  };
}

function fmtSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function pad(str, len) {
  return String(str).slice(0, len).padEnd(len);
}

function printReport(snap) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  HEAP SNAPSHOT ANALYSIS: ${snap.fileName}`);
  console.log('═'.repeat(70));
  console.log(`  Total nodes   : ${snap.nodeCount.toLocaleString()}`);
  console.log(`  Total edges   : ${snap.edgeCount.toLocaleString()}`);
  console.log(`  Total self sz : ${fmtSize(snap.totalSize)}`);
  console.log(`  Detached nodes: ${snap.detached.length.toLocaleString()}`);
  console.log('');

  console.log('─'.repeat(70));
  console.log('  TOP 20 OBJECT CLASSES BY SELF SIZE');
  console.log('─'.repeat(70));
  console.log(`  ${'Class'.padEnd(40)} ${'Count'.padStart(8)}  ${'Self Size'.padStart(12)}`);
  console.log(`  ${'─'.repeat(40)} ${'─'.repeat(8)}  ${'─'.repeat(12)}`);
  for (const cls of snap.topBySize.slice(0, 20)) {
    const pct = ((cls.selfSize / snap.totalSize) * 100).toFixed(1);
    console.log(`  ${pad(cls.key, 40)} ${String(cls.count).padStart(8)}  ${fmtSize(cls.selfSize).padStart(10)} (${pct}%)`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('  TOP 10 OBJECT CLASSES BY COUNT');
  console.log('─'.repeat(70));
  console.log(`  ${'Class'.padEnd(40)} ${'Count'.padStart(8)}`);
  for (const cls of snap.topByCount.slice(0, 10)) {
    console.log(`  ${pad(cls.key, 40)} ${String(cls.count).padStart(8)}`);
  }

  if (snap.detached.length > 0) {
    console.log('');
    console.log('─'.repeat(70));
    console.log(`  DETACHED NODES (${snap.detached.length}) — potential DOM leaks`);
    console.log('─'.repeat(70));
    const detachedByType = new Map();
    for (const n of snap.detached) {
      const k = `${n.type}:${n.name}`;
      detachedByType.set(k, (detachedByType.get(k) || 0) + 1);
    }
    for (const [k, v] of [...detachedByType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  ${pad(k, 50)} x${v}`);
    }
  }

  if (snap.largeObjects.length > 0) {
    console.log('');
    console.log('─'.repeat(70));
    console.log('  LARGE OBJECTS (>100KB self size)');
    console.log('─'.repeat(70));
    for (const obj of snap.largeObjects.slice(0, 10)) {
      console.log(`  ${pad(`${obj.type}:${obj.name}`, 50)} ${fmtSize(obj.selfSize)}`);
    }
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('  SUSPICION ANALYSIS');
  console.log('─'.repeat(70));
  printSuspicions(snap);

  console.log('═'.repeat(70) + '\n');
}

function printSuspicions(snap) {
  const suspicions = [];

  for (const cls of snap.topBySize) {
    if (cls.type === 'closure' && cls.selfSize > 5 * 1024 * 1024) {
      suspicions.push(`HIGH closure retained size (${fmtSize(cls.selfSize)}) for "${cls.name}" — check for event listeners not being removed`);
    }
    if (cls.key === 'array' && cls.selfSize > 10 * 1024 * 1024) {
      suspicions.push(`Large array allocation (${fmtSize(cls.selfSize)}) — check for unbounded caches or queues`);
    }
    if (cls.key === 'string' && cls.selfSize > 20 * 1024 * 1024) {
      suspicions.push(`Heavy string usage (${fmtSize(cls.selfSize)}) — check for log accumulation or string concatenation in loops`);
    }
    if ((cls.key === 'object:Buffer' || cls.key === 'object:Uint8Array') && cls.selfSize > 10 * 1024 * 1024) {
      suspicions.push(`Large Buffer/Uint8Array usage (${fmtSize(cls.selfSize)}) — check for streams not being consumed or closed`);
    }
  }

  if (snap.detached.length > 50) {
    suspicions.push(`${snap.detached.length} detached nodes — DOM elements removed from tree but still referenced in JS`);
  }

  const promises = snap.byClass.get('object:Promise');
  if (promises && promises.count > 1000) {
    suspicions.push(`${promises.count.toLocaleString()} Promise objects — check for unresolved or chained promises accumulating`);
  }

  if (suspicions.length === 0) {
    console.log('  No obvious leak patterns detected in self-size analysis.');
    console.log('     For definitive results, use the 3-snapshot technique.');
  } else {
    for (const s of suspicions) {
      console.log('  ' + s);
    }
  }
}

function printDiff(snap1, snap2) {
  console.log('\n' + '═'.repeat(70));
  console.log(`  HEAP DIFF: ${snap1.fileName} → ${snap2.fileName}`);
  console.log('═'.repeat(70));

  const sizeDelta = snap2.totalSize - snap1.totalSize;
  const nodeDelta = snap2.nodeCount - snap1.nodeCount;
  console.log(`  Total size delta : ${sizeDelta >= 0 ? '+' : ''}${fmtSize(Math.abs(sizeDelta))}`);
  console.log(`  Node count delta : ${nodeDelta >= 0 ? '+' : ''}${nodeDelta.toLocaleString()}`);

  console.log('');
  console.log('─'.repeat(70));
  console.log('  GROWING CLASSES (ordered by size increase)');
  console.log('─'.repeat(70));
  console.log(`  ${'Class'.padEnd(40)} ${'Δ Count'.padStart(10)}  ${'Δ Size'.padStart(12)}`);

  const diffs = [];
  for (const [key, cls2] of snap2.byClass.entries()) {
    const cls1 = snap1.byClass.get(key);
    const deltaSize = cls2.selfSize - (cls1?.selfSize || 0);
    const deltaCount = cls2.count - (cls1?.count || 0);
    if (deltaSize > 0 || deltaCount > 0) {
      diffs.push({ key, deltaSize, deltaCount });
    }
  }

  diffs.sort((a, b) => b.deltaSize - a.deltaSize);
  for (const d of diffs.slice(0, 25)) {
    const sign = d.deltaSize >= 0 ? '+' : '';
    console.log(`  ${pad(d.key, 40)} ${('+' + d.deltaCount).padStart(10)}  ${(sign + fmtSize(d.deltaSize)).padStart(12)}`);
  }

  console.log('');
  console.log('─'.repeat(70));
  console.log('  LEAK CANDIDATES (new classes or significant growth)');
  console.log('─'.repeat(70));
  const leakCandidates = diffs.filter(d => d.deltaSize > 1024 * 1024 || d.deltaCount > 500);
  if (leakCandidates.length === 0) {
    console.log('  No significant growth detected between snapshots.');
  } else {
    for (const d of leakCandidates) {
      console.log(`  "${d.key}" grew by +${d.deltaCount} objects / +${fmtSize(d.deltaSize)}`);
    }
  }
  console.log('═'.repeat(70) + '\n');
}

const snapshots = files.map(parseSnapshot);

if (jsonOutput) {
  const output = snapshots.map(s => ({
    file: s.fileName,
    nodeCount: s.nodeCount,
    totalSize: s.totalSize,
    topBySize: s.topBySize.slice(0, 20).map(c => ({ ...c, selfSizeFormatted: fmtSize(c.selfSize) })),
    detachedCount: s.detached.length,
  }));
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const snap of snapshots) {
    printReport(snap);
  }
  if (snapshots.length === 2) {
    printDiff(snapshots[0], snapshots[1]);
  }
  if (snapshots.length === 3) {
    console.log('\n3-SNAPSHOT DIFF ANALYSIS');
    printDiff(snapshots[0], snapshots[1]);
    printDiff(snapshots[1], snapshots[2]);
    printDiff(snapshots[0], snapshots[2]);
  }
}