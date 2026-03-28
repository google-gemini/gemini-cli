#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * diff-snapshots.cjs
 *
 * Compare two V8 heap snapshots and identify potential memory leaks.
 * Parses .heapsnapshot files and reports on constructor growth patterns.
 *
 * Usage:
 *   node diff-snapshots.cjs --baseline snap1.heapsnapshot --target snap3.heapsnapshot --top 20
 */

'use strict';

const fs = require('node:fs');

function parseArgs(argv) {
  const args = { baseline: null, target: null, top: 20 };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--baseline':
        args.baseline = argv[++i];
        break;
      case '--target':
        args.target = argv[++i];
        break;
      case '--top':
        args.top = parseInt(argv[++i], 10);
        break;
      case '--help':
        console.log(
          'Usage: node diff-snapshots.cjs [options]\n\n' +
            'Options:\n' +
            '  --baseline <file>    Path to the baseline (earlier) snapshot\n' +
            '  --target <file>      Path to the target (later) snapshot\n' +
            '  --top <n>            Number of top results to show (default: 20)\n' +
            '  --help               Show this help message\n',
        );
        process.exit(0);
        break;
    }
  }

  if (!args.baseline || !args.target) {
    console.error(
      'Error: Both --baseline and --target are required.\n' +
        'Usage: node diff-snapshots.cjs --baseline <file> --target <file>',
    );
    process.exit(1);
  }

  return args;
}

function formatBytes(bytes) {
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Parse a V8 heap snapshot and aggregate stats by constructor name.
 *
 * The .heapsnapshot format has:
 * - snapshot.meta.node_fields: field names for each node
 * - nodes: flat array of node data (stride = node_fields.length)
 * - strings: array of string values referenced by index
 */
function parseHeapSnapshot(filepath) {
  console.log(`  Parsing ${filepath}...`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const snapshot = JSON.parse(raw);

  const nodeFields = snapshot.snapshot.meta.node_fields;
  const nodes = snapshot.nodes;
  const strings = snapshot.strings;

  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const selfSizeIdx = nodeFields.indexOf('self_size');
  const stride = nodeFields.length;

  const constructorStats = new Map();

  for (let i = 0; i < nodes.length; i += stride) {
    const nameIndex = nodes[i + nameIdx];
    const selfSize = nodes[i + selfSizeIdx];
    const name = strings[nameIndex] || '(unknown)';

    if (!constructorStats.has(name)) {
      constructorStats.set(name, { count: 0, totalSize: 0 });
    }
    const stats = constructorStats.get(name);
    stats.count += 1;
    stats.totalSize += selfSize;
  }

  // Compute totals
  let totalNodes = 0;
  let totalSize = 0;
  for (const stats of constructorStats.values()) {
    totalNodes += stats.count;
    totalSize += stats.totalSize;
  }

  return { constructorStats, totalNodes, totalSize };
}

function main() {
  const args = parseArgs(process.argv);

  console.log(`Memory Investigator — Snapshot Diff`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Baseline: ${args.baseline}`);
  console.log(`Target:   ${args.target}\n`);

  const baseline = parseHeapSnapshot(args.baseline);
  const target = parseHeapSnapshot(args.target);

  // Overall summary
  const nodeGrowth = target.totalNodes - baseline.totalNodes;
  const sizeGrowth = target.totalSize - baseline.totalSize;

  console.log(`\nOverall Memory Summary`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  Baseline: ${baseline.totalNodes.toLocaleString()} objects, ${formatBytes(baseline.totalSize)}`,
  );
  console.log(
    `  Target:   ${target.totalNodes.toLocaleString()} objects, ${formatBytes(target.totalSize)}`,
  );
  console.log(
    `  Growth:   ${nodeGrowth >= 0 ? '+' : ''}${nodeGrowth.toLocaleString()} objects, ${sizeGrowth >= 0 ? '+' : ''}${formatBytes(sizeGrowth)}`,
  );

  // Compute per-constructor diffs
  const allConstructors = new Set([
    ...baseline.constructorStats.keys(),
    ...target.constructorStats.keys(),
  ]);

  const diffs = [];

  for (const name of allConstructors) {
    const base = baseline.constructorStats.get(name) || {
      count: 0,
      totalSize: 0,
    };
    const tgt = target.constructorStats.get(name) || {
      count: 0,
      totalSize: 0,
    };

    const countDiff = tgt.count - base.count;
    const sizeDiff = tgt.totalSize - base.totalSize;

    if (countDiff > 0 || sizeDiff > 0) {
      diffs.push({
        name,
        countDiff,
        sizeDiff,
        baseCount: base.count,
        targetCount: tgt.count,
        baseSize: base.totalSize,
        targetSize: tgt.totalSize,
      });
    }
  }

  // Top by instance count growth
  const byCount = [...diffs].sort((a, b) => b.countDiff - a.countDiff);
  console.log(`\nTop ${args.top} Constructors by Instance Count Growth`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  ${'Constructor'.padEnd(40)} ${'Baseline'.padStart(10)} ${'Target'.padStart(10)} ${'Growth'.padStart(10)}`,
  );
  console.log(
    `  ${'─'.repeat(40)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`,
  );
  for (const d of byCount.slice(0, args.top)) {
    console.log(
      `  ${d.name.slice(0, 40).padEnd(40)} ${String(d.baseCount).padStart(10)} ${String(d.targetCount).padStart(10)} ${('+' + d.countDiff).padStart(10)}`,
    );
  }

  // Top by size growth
  const bySize = [...diffs].sort((a, b) => b.sizeDiff - a.sizeDiff);
  console.log(`\nTop ${args.top} Constructors by Size Growth`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  ${'Constructor'.padEnd(40)} ${'Baseline'.padStart(10)} ${'Target'.padStart(10)} ${'Growth'.padStart(10)}`,
  );
  console.log(
    `  ${'─'.repeat(40)} ${'─'.repeat(10)} ${'─'.repeat(10)} ${'─'.repeat(10)}`,
  );
  for (const d of bySize.slice(0, args.top)) {
    console.log(
      `  ${d.name.slice(0, 40).padEnd(40)} ${formatBytes(d.baseSize).padStart(10)} ${formatBytes(d.targetSize).padStart(10)} ${('+' + formatBytes(d.sizeDiff)).padStart(10)}`,
    );
  }

  // Suspected leak candidates (grew significantly in both count and size)
  const suspects = diffs.filter((d) => d.countDiff > 10 && d.sizeDiff > 1024);
  suspects.sort((a, b) => b.sizeDiff - a.sizeDiff);

  if (suspects.length > 0) {
    console.log(`\n⚠  Suspected Leak Candidates`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    for (const s of suspects.slice(0, 10)) {
      console.log(
        `  ${s.name}: +${s.countDiff} instances (+${formatBytes(s.sizeDiff)})`,
      );
    }
    console.log(
      `\nThese constructors showed significant growth in both instance count and memory size.`,
    );
    console.log(
      `Investigate their allocation sites and ensure proper cleanup (dispose, removeListener, etc.).`,
    );
  } else {
    console.log(`\n✓ No obvious leak candidates detected.`);
    console.log(
      `Memory growth appears stable. Consider running with a longer interval or more snapshots.`,
    );
  }
}

main();
