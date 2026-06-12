#!/usr/bin/env node

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * analyze-profile.cjs
 *
 * Parses a V8 .cpuprofile file and generates an LLM-friendly summary
 * of hot functions, call trees, and optimization suggestions.
 *
 * Usage:
 *   node analyze-profile.cjs --input profile.cpuprofile --top 20
 */

'use strict';

const fs = require('node:fs');

function parseArgs(argv) {
  const args = { input: null, top: 20 };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--top':
        args.top = parseInt(argv[++i], 10);
        break;
      case '--help':
        console.log(
          'Usage: node analyze-profile.cjs [options]\n\n' +
            'Options:\n' +
            '  --input <file>       Path to .cpuprofile file\n' +
            '  --top <n>            Number of top results (default: 20)\n' +
            '  --help               Show this help message\n',
        );
        process.exit(0);
        break;
    }
  }

  if (!args.input) {
    console.error('Error: --input is required.');
    process.exit(1);
  }

  return args;
}

function formatMicroseconds(us) {
  if (us < 1000) return `${us.toFixed(0)}µs`;
  if (us < 1000000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1000000).toFixed(2)}s`;
}

function main() {
  const args = parseArgs(process.argv);

  console.log(`Performance Profiler — Profile Analysis`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Input: ${args.input}\n`);

  const raw = fs.readFileSync(args.input, 'utf8');
  const profile = JSON.parse(raw);

  const nodes = profile.nodes;
  const samples = profile.samples || [];
  const timeDeltas = profile.timeDeltas || [];

  if (!nodes || nodes.length === 0) {
    console.error('Error: Profile contains no nodes.');
    process.exit(1);
  }

  // Build node map
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, {
      ...node,
      selfTime: 0,
      totalHits: 0,
    });
  }

  // Calculate self-time from samples and timeDeltas
  for (let i = 0; i < samples.length; i++) {
    const nodeId = samples[i];
    const delta = timeDeltas[i] || 0;
    const node = nodeMap.get(nodeId);
    if (node) {
      node.selfTime += delta;
      node.totalHits += 1;
    }
  }

  // Build function aggregation (merge nodes with same function)
  const funcStats = new Map();

  for (const node of nodeMap.values()) {
    const callFrame = node.callFrame;
    const funcName = callFrame.functionName || '(anonymous)';
    const url = callFrame.url || '(native)';
    const key = `${funcName}@${url}:${callFrame.lineNumber}`;

    if (!funcStats.has(key)) {
      funcStats.set(key, {
        functionName: funcName,
        url,
        lineNumber: callFrame.lineNumber,
        selfTime: 0,
        hitCount: 0,
      });
    }

    const stats = funcStats.get(key);
    stats.selfTime += node.selfTime;
    stats.hitCount += node.totalHits;
  }

  // Total profiling time
  const totalTime = timeDeltas.reduce((sum, d) => sum + d, 0);

  console.log(`Profile Summary`);
  console.log(`━━━━━━━━━━━━━━━`);
  console.log(`  Total nodes:    ${nodes.length}`);
  console.log(`  Total samples:  ${samples.length}`);
  console.log(`  Total time:     ${formatMicroseconds(totalTime)}`);
  console.log(
    `  Sample rate:    ${samples.length > 0 ? formatMicroseconds(totalTime / samples.length) : 'N/A'}/sample`,
  );

  // Top by self-time
  const bySelfTime = [...funcStats.values()].sort(
    (a, b) => b.selfTime - a.selfTime,
  );

  console.log(`\nTop ${args.top} Functions by Self-Time (CPU Bottlenecks)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(
    `  ${'Function'.padEnd(40)} ${'Self-Time'.padStart(12)} ${'%'.padStart(6)} ${'Hits'.padStart(8)}`,
  );
  console.log(
    `  ${'─'.repeat(40)} ${'─'.repeat(12)} ${'─'.repeat(6)} ${'─'.repeat(8)}`,
  );

  for (const fn of bySelfTime.slice(0, args.top)) {
    const pct =
      totalTime > 0 ? ((fn.selfTime / totalTime) * 100).toFixed(1) : '0.0';
    const location = fn.url !== '(native)' ? `${fn.url}:${fn.lineNumber}` : '';
    console.log(
      `  ${fn.functionName.slice(0, 40).padEnd(40)} ${formatMicroseconds(fn.selfTime).padStart(12)} ${(pct + '%').padStart(6)} ${String(fn.hitCount).padStart(8)}`,
    );
    if (location) {
      console.log(`    └─ ${location}`);
    }
  }

  // Detect common patterns
  console.log(`\nOptimization Hints`);
  console.log(`━━━━━━━━━━━━━━━━━━`);

  const hints = [];
  for (const fn of bySelfTime.slice(0, 50)) {
    const name = fn.functionName.toLowerCase();
    const pct = totalTime > 0 ? (fn.selfTime / totalTime) * 100 : 0;

    if (pct < 1) continue;

    if (name.includes('gc') || name.includes('garbage')) {
      hints.push(
        `⚠ GC pressure detected: "${fn.functionName}" (${pct.toFixed(1)}%). Consider reducing allocations.`,
      );
    }
    if (name.includes('json.parse') || name.includes('json.stringify')) {
      hints.push(
        `⚠ Heavy JSON operations: "${fn.functionName}" (${pct.toFixed(1)}%). Consider streaming or caching.`,
      );
    }
    if (name.includes('regexp') || name.includes('regex')) {
      hints.push(
        `⚠ Regex CPU cost: "${fn.functionName}" (${pct.toFixed(1)}%). Consider pre-compiling or simplifying patterns.`,
      );
    }
    if (name === '(idle)' && pct > 50) {
      hints.push(
        `ℹ Process is mostly idle (${pct.toFixed(1)}%). Profile during higher load for more meaningful data.`,
      );
    }
  }

  if (hints.length > 0) {
    for (const hint of hints) {
      console.log(`  ${hint}`);
    }
  } else {
    console.log(`  No common optimization patterns detected.`);
    console.log(
      `  Review the top functions above and their call sites for optimization opportunities.`,
    );
  }

  console.log(
    `\nTip: Use the perf-trace skill to convert this profile to Perfetto format for visual exploration.`,
  );
}

main();
