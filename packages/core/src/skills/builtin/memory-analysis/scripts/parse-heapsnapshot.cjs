/*
 * parse-heapsnapshot.cjs — Parse a V8 .heapsnapshot file and output a compact
 * JSON summary suitable for LLM consumption (<5KB).
 *
 * Usage:
 *   node parse-heapsnapshot.cjs --input=<file.heapsnapshot> [--top=20]
 *
 * Zero external dependencies. Uses only node:fs, node:path.
 * Handles files up to ~200MB via JSON.parse with a size guard.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// --- Argument parsing ---

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// --- Size formatting ---

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

// --- Core parser ---

function parseHeapSnapshot(filePath, topN) {
  const stat = fs.statSync(filePath);

  // Safety: refuse files > 200MB to avoid OOM in the CLI process itself
  const MAX_SIZE = 200 * 1024 * 1024;
  if (stat.size > MAX_SIZE) {
    return {
      error: `File too large (${formatBytes(stat.size)}). Max supported: ${formatBytes(MAX_SIZE)}. Use streaming parser for production snapshots.`,
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let snapshot;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    return { error: 'Invalid JSON — file may be truncated or corrupt.' };
  }

  const meta = snapshot.snapshot && snapshot.snapshot.meta;
  if (!meta || !meta.node_fields || !snapshot.nodes || !snapshot.strings) {
    return { error: 'Not a valid V8 .heapsnapshot file — missing required fields.' };
  }

  // Build field index dynamically (handles different Node.js versions)
  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields || [];
  const nodeFieldCount = nodeFields.length;

  const idx = {};
  nodeFields.forEach((f, i) => { idx[f] = i; });

  const typeIdx = idx['type'];
  const nameIdx = idx['name'];
  const idIdx = idx['id'];
  const selfSizeIdx = idx['self_size'];

  const nodeTypes = (meta.node_types && meta.node_types[0]) || [];
  const strings = snapshot.strings;
  const nodes = snapshot.nodes;
  const nodeCount = nodes.length / nodeFieldCount;

  // Aggregate by constructor name
  const constructorStats = new Map();
  let totalSize = 0;

  for (let i = 0; i < nodeCount; i++) {
    const offset = i * nodeFieldCount;
    const typeId = nodes[offset + typeIdx];
    const nameId = nodes[offset + nameIdx];
    const selfSize = nodes[offset + selfSizeIdx];

    const typeName = nodeTypes[typeId] || 'unknown';
    const name = strings[nameId] || '(unknown)';

    totalSize += selfSize;

    // Use constructor name for object types, type name otherwise
    const key = typeName === 'object' || typeName === 'closure' ? name : `(${typeName})`;

    if (!constructorStats.has(key)) {
      constructorStats.set(key, { count: 0, shallowSize: 0 });
    }
    const stat = constructorStats.get(key);
    stat.count += 1;
    stat.shallowSize += selfSize;
  }

  // Sort by shallow size descending
  const sorted = [...constructorStats.entries()]
    .sort((a, b) => b[1].shallowSize - a[1].shallowSize);

  const topConstructors = sorted.slice(0, topN).map(([name, stat]) => ({
    name,
    count: stat.count,
    shallow_size: formatBytes(stat.shallowSize),
    shallow_size_bytes: stat.shallowSize,
    pct: ((stat.shallowSize / totalSize) * 100).toFixed(1) + '%',
  }));

  // Detect suspicious patterns
  const patterns = [];

  // Large string accumulation
  const stringEntry = constructorStats.get('(string)');
  if (stringEntry && stringEntry.shallowSize > totalSize * 0.3) {
    patterns.push({
      pattern: 'string_accumulation',
      evidence: `Strings account for ${((stringEntry.shallowSize / totalSize) * 100).toFixed(0)}% of heap`,
      suggestion: 'Look for unbounded string concatenation, logging buffers, or template caches.',
    });
  }

  // Array/object count explosion
  for (const [name, stat] of sorted.slice(0, 5)) {
    if (stat.count > 10000 && stat.shallowSize > 1024 * 1024) {
      patterns.push({
        pattern: 'high_instance_count',
        constructor: name,
        count: stat.count,
        evidence: `${stat.count} instances totaling ${formatBytes(stat.shallowSize)}`,
        suggestion: `Search codebase for \`new ${name}\` or factory functions creating ${name}.`,
      });
    }
  }

  // Find individually large objects (> 1MB shallow)
  const largeObjects = [];
  for (let i = 0; i < nodeCount && largeObjects.length < 5; i++) {
    const offset = i * nodeFieldCount;
    const selfSize = nodes[offset + selfSizeIdx];
    if (selfSize > 1024 * 1024) {
      const nameId = nodes[offset + nameIdx];
      const typeId = nodes[offset + typeIdx];
      largeObjects.push({
        constructor: strings[nameId] || nodeTypes[typeId] || 'unknown',
        size: formatBytes(selfSize),
        node_id: nodes[offset + idIdx],
      });
    }
  }

  return {
    snapshot_info: {
      file: path.basename(filePath),
      node_count: nodeCount,
      total_shallow_size: formatBytes(totalSize),
      edge_field_count: edgeFields.length,
    },
    top_constructors: topConstructors,
    suspicious_patterns: patterns.length > 0 ? patterns : [{ pattern: 'none_detected' }],
    large_objects: largeObjects.length > 0 ? largeObjects : 'none > 1MB',
  };
}

// --- Main ---

function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    console.log(JSON.stringify({
      error: 'Usage: node parse-heapsnapshot.cjs --input=<file.heapsnapshot> [--top=20]',
    }, null, 2));
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.log(JSON.stringify({ error: `File not found: ${inputPath}` }, null, 2));
    process.exit(1);
  }

  const topN = parseInt(args.top, 10) || 20;
  const result = parseHeapSnapshot(inputPath, topN);

  console.log(JSON.stringify(result, null, 2));

  if (result.error) {
    process.exit(1);
  }
}

main();
