/**
 * diff-snapshots.cjs — 3-snapshot memory leak detection.
 * Prototype for GSoC 2026 proposal: https://github.com/google-gemini/gemini-cli/issues/23365
 *
 * Implements the 3-snapshot technique:
 *   Leaked objects = objects present in S3 that were first allocated between S1 and S2
 *   i.e. (S2 - S1) ∩ S3 — survived at least one GC cycle
 *
 * Usage:
 *   node diff-snapshots.cjs --s1=<file> --s2=<file> --s3=<file>
 *
 * Zero external dependencies. Handles files up to 200MB each.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --- Helpers ---

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([\w-]+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes < 0) return `-${formatBytes(-bytes)}`;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// V8 internal types that are noise — filter from user-visible results
const INTERNAL_TYPES = new Set([
  '(hidden)', '(object shape)', '(sliced string)', '(concatenated string)',
  '(code)', '(array)', '(number)', '(bigint)', '(symbol)',
  'CodeRelocationInfo', 'FeedbackVector', 'BytecodeArray',
]);

// --- Parser ---

const MAX_SIZE = 200 * 1024 * 1024;

function loadAndExtract(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_SIZE) {
    throw new Error(`File too large: ${path.basename(filePath)} (${formatBytes(stat.size)}). Max: ${formatBytes(MAX_SIZE)}`);
  }

  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const meta = snap.snapshot && snap.snapshot.meta;
  if (!meta || !meta.node_fields || !snap.nodes || !snap.strings) {
    throw new Error(`Not a valid .heapsnapshot: ${path.basename(filePath)}`);
  }

  const nf = meta.node_fields;
  const nfc = nf.length;
  const idx = Object.fromEntries(nf.map((f, i) => [f, i]));
  const nodeTypes = (meta.node_types && meta.node_types[0]) || [];
  const { strings, nodes } = snap;
  const nodeCount = nodes.length / nfc;

  // Map: nodeId -> { constructor, selfSize }
  const nodeMap = new Map();
  let totalSize = 0;

  for (let i = 0; i < nodeCount; i++) {
    const o = i * nfc;
    const typeId  = nodes[o + idx.type];
    const nameId  = nodes[o + idx.name];
    const id      = nodes[o + idx.id];
    const self    = nodes[o + idx.self_size];

    const typeName = nodeTypes[typeId] || 'unknown';
    const name = strings[nameId] || '(unknown)';
    const ctor = (typeName === 'object' || typeName === 'closure') ? name : `(${typeName})`;

    nodeMap.set(id, { ctor, self });
    totalSize += self;
  }

  return { nodeMap, totalSize, nodeCount };
}

// --- Core diff ---

function diff(s1Path, s2Path, s3Path) {
  const { nodeMap: m1, totalSize: sz1, nodeCount: n1 } = loadAndExtract(s1Path);
  const { nodeMap: m2, totalSize: sz2, nodeCount: n2 } = loadAndExtract(s2Path);
  const { nodeMap: m3, totalSize: sz3, nodeCount: n3 } = loadAndExtract(s3Path);

  // Step 1: new_in_s2 = nodes in S2 not in S1
  const newInS2 = new Map();
  for (const [id, info] of m2) {
    if (!m1.has(id)) newInS2.set(id, info);
  }

  // Step 2: leaked = new_in_s2 nodes that still exist in S3
  const byConstructor = new Map();
  let leakedCount = 0;
  let leakedSize  = 0;

  for (const [id, info] of newInS2) {
    if (m3.has(id)) {
      leakedCount++;
      leakedSize += info.self;
      if (!byConstructor.has(info.ctor)) {
        byConstructor.set(info.ctor, { count: 0, size: 0 });
      }
      const e = byConstructor.get(info.ctor);
      e.count++;
      e.size += info.self;
    }
  }

  // Step 3: separate user-land leaks from V8 internal noise
  const sorted = [...byConstructor.entries()].sort((a, b) => b[1].size - a[1].size);
  const userLeaks     = sorted.filter(([n]) => !INTERNAL_TYPES.has(n));
  const internalNoise = sorted.filter(([n]) =>  INTERNAL_TYPES.has(n));

  const formatLeaks = (arr) =>
    arr.slice(0, 10).map(([name, s]) => ({
      name,
      count: s.count,
      total_size: formatBytes(s.size),
      pct: leakedSize > 0 ? ((s.size / leakedSize) * 100).toFixed(1) + '%' : '0%',
    }));

  // Step 4: growth verdict
  const g12 = sz2 - sz1;
  const g23 = sz3 - sz2;
  const avgGrowth = (g12 + g23) / 2;
  const drift = Math.abs(g12 - g23);

  let verdict;
  if (leakedCount === 0) {
    verdict = 'no leak detected — all S2 allocations were GC\'d before S3';
  } else if (drift < avgGrowth * 0.2) {
    verdict = 'consistent growth — steady leak';
  } else if (g23 > g12 * 1.5) {
    verdict = 'accelerating growth — leak rate increasing';
  } else {
    verdict = 'intermittent growth — investigate further';
  }

  return {
    technique: '3-snapshot',
    snapshots: {
      s1: { file: path.basename(s1Path), nodes: n1, total_size: formatBytes(sz1) },
      s2: { file: path.basename(s2Path), nodes: n2, total_size: formatBytes(sz2) },
      s3: { file: path.basename(s3Path), nodes: n3, total_size: formatBytes(sz3) },
    },
    growth_stats: {
      s1_to_s2: `+${formatBytes(Math.max(0, g12))}`,
      s2_to_s3: `+${formatBytes(Math.max(0, g23))}`,
      new_allocations_in_s2: newInS2.size,
      survived_to_s3: leakedCount,
      verdict,
    },
    leaked_constructors: userLeaks.length > 0
      ? formatLeaks(userLeaks)
      : [{ note: 'no user-land leaks detected — check internal_noise if suspicious' }],
    internal_noise_filtered: internalNoise.length > 0
      ? internalNoise.slice(0, 5).map(([n]) => n)
      : 'none',
    summary: {
      total_leaked_objects: leakedCount,
      total_leaked_size: formatBytes(leakedSize),
    },
  };
}

// --- Main ---

function main() {
  const args = parseArgs(process.argv);

  if (!args.s1 || !args.s2 || !args.s3) {
    console.log(JSON.stringify({
      error: 'Usage: node diff-snapshots.cjs --s1=<baseline> --s2=<mid> --s3=<final>',
    }, null, 2));
    process.exit(1);
  }

  const paths = { s1: args.s1, s2: args.s2, s3: args.s3 };
  for (const [key, file] of Object.entries(paths)) {
    if (!fs.existsSync(path.resolve(file))) {
      console.log(JSON.stringify({ error: `File not found (--${key}): ${file}` }, null, 2));
      process.exit(1);
    }
  }

  try {
    const result = diff(
      path.resolve(args.s1),
      path.resolve(args.s2),
      path.resolve(args.s3),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
