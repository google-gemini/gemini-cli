/**
 * diff.mjs — V8 Heapsnapshot Parser & Diff Engine
 *
 * Parses .heapsnapshot files (V8 format), reconstructs per-constructor
 * size aggregations, and computes retained size deltas across snapshots.
 *
 * Zero external dependencies. Uses dynamic field indexing from snapshot
 * metadata to handle any V8/Node version.
 *
 * @license Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

// System/internal V8 types that dominate diffs but aren't user-actionable
const SYSTEM_TYPES = new Set([
  '(system)',
  '(compiled code)',
  '(code deopt data)',
  '(sliced string)',
  '(concatenated string)',
  '(internalized string)',
  'system / Context',
  '(object shape)',
  '(transition)',
  '(map descriptors)',
  '(feedback vector)',
  '(code relocation info)',
  '(source position table)',
  'system / BytecodeArray',
  'system / FeedbackVector',
  'system / JSArrayBufferData',
]);

// Regex patterns for V8 internal types (e.g., "(code for someFunction)")
const SYSTEM_TYPE_PATTERNS = [
  /^\(code for /,
  /^system \/ /,
];

// Minimum size delta (bytes) to include in output — noise floor
const NOISE_FLOOR_BYTES = 1024; // 1 KB

// Maximum snapshot file size we will attempt to JSON.parse
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Parse a V8 .heapsnapshot file and return a Map of constructor names
 * to aggregated stats: { count, selfSize }.
 *
 * Uses dynamic field indexing from snapshot metadata — never hardcodes
 * field positions.
 */
export function parseSnapshot(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Cannot read snapshot file: ${absolutePath} (file not found)`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Snapshot file exceeds 200MB safety limit (actual: ${sizeMB}MB). ` +
      `Use streaming parser for large files.`
    );
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in snapshot file: ${absolutePath}`);
  }

  // Validate required metadata
  if (!data.snapshot?.meta?.node_fields) {
    throw new Error(
      `Invalid heapsnapshot format: missing 'snapshot.meta.node_fields' in ${absolutePath}`
    );
  }
  if (!data.nodes || !data.strings) {
    throw new Error(
      `Invalid heapsnapshot format: missing 'nodes' or 'strings' array in ${absolutePath}`
    );
  }

  const nodeFields = data.snapshot.meta.node_fields;
  const nodeFieldCount = nodeFields.length;

  // Dynamically find required field indices
  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const selfSizeIdx = nodeFields.indexOf('self_size');

  // Validate required fields exist
  for (const [field, idx] of [['name', nameIdx], ['self_size', selfSizeIdx]]) {
    if (idx === -1) {
      throw new Error(
        `Invalid heapsnapshot format: missing required field '${field}' in node_fields metadata`
      );
    }
  }

  const nodes = data.nodes;
  const strings = data.strings;

  // Also extract node types array for type resolution
  const nodeTypes = data.snapshot.meta.node_types;
  const typeNames = Array.isArray(nodeTypes?.[0]) ? nodeTypes[0] : [];

  // Build per-constructor size map
  const typeMap = new Map();

  for (let i = 0; i < nodes.length; i += nodeFieldCount) {
    const nameIndex = nodes[i + nameIdx];
    const selfSize = nodes[i + selfSizeIdx];
    const constructorName = strings[nameIndex] || '(unknown)';

    // Resolve the V8 node type (hidden, object, string, etc.)
    let nodeType = '';
    if (typeIdx !== -1 && typeNames.length > 0) {
      const typeIndex = nodes[i + typeIdx];
      nodeType = typeNames[typeIndex] || '';
    }

    const entry = typeMap.get(constructorName) || { count: 0, selfSize: 0, nodeType };
    entry.count++;
    entry.selfSize += selfSize;
    typeMap.set(constructorName, entry);
  }

  return typeMap;
}

/**
 * Compute diff between two parsed snapshot type maps.
 *
 * Returns an array of objects sorted by size delta (descending):
 * { name, nodeType, sizeDelta, countDelta, currentSize, currentCount }
 *
 * Filters out system types and noise below NOISE_FLOOR_BYTES.
 */
export function diffSnapshots(map1, map2, options = {}) {
  const {
    topK = 15,
    filterSystem = true,
    noiseFloor = NOISE_FLOOR_BYTES,
  } = options;

  const diffs = [];

  // Check all types in the newer snapshot
  for (const [name, stats2] of map2) {
    if (filterSystem && SYSTEM_TYPES.has(name)) continue;
    if (filterSystem && SYSTEM_TYPE_PATTERNS.some(p => p.test(name))) continue;

    const stats1 = map1.get(name) || { count: 0, selfSize: 0 };
    const sizeDelta = stats2.selfSize - stats1.selfSize;
    const countDelta = stats2.count - stats1.count;

    // Skip noise
    if (Math.abs(sizeDelta) < noiseFloor) continue;

    diffs.push({
      name,
      nodeType: stats2.nodeType || '',
      sizeDelta,
      countDelta,
      currentSize: stats2.selfSize,
      currentCount: stats2.count,
    });
  }

  // Also check for types that were in map1 but disappeared in map2
  for (const [name, stats1] of map1) {
    if (filterSystem && SYSTEM_TYPES.has(name)) continue;
    if (filterSystem && SYSTEM_TYPE_PATTERNS.some(p => p.test(name))) continue;
    if (map2.has(name)) continue; // already handled above

    const sizeDelta = -stats1.selfSize;
    if (Math.abs(sizeDelta) < noiseFloor) continue;

    diffs.push({
      name,
      nodeType: stats1.nodeType || '',
      sizeDelta,
      countDelta: -stats1.count,
      currentSize: 0,
      currentCount: 0,
    });
  }

  // Sort by absolute size delta descending
  diffs.sort((a, b) => Math.abs(b.sizeDelta) - Math.abs(a.sizeDelta));

  return diffs.slice(0, topK);
}

// ── Generic runtime type names that are low-signal ──
const GENERIC_TYPES = new Set([
  'Object', 'Array', 'ArrayBuffer', 'Buffer',
  '(string)', '(array)', '(object properties)',
  'SharedArrayBuffer', 'Uint8Array', 'Int32Array',
  'Float64Array', 'DataView',
]);

// ── User-code name patterns (high-signal) ──
const USER_NAME_PATTERNS = [
  /^[A-Z][a-z]/, // PascalCase user constructors
  /Handler$/, /Manager$/, /Service$/, /Context$/,
  /Controller$/, /Provider$/, /Factory$/, /Listener$/,
];

/**
 * Compute an actionability score for a single anomaly.
 *
 * Higher = more useful to show the developer.
 *
 * @param {Object} anomaly - A diff entry
 * @param {Object} [retainerInfo] - Optional retainer chain info
 * @returns {number}
 */
export function computeActionabilityScore(anomaly, retainerInfo = null) {
  let score = 0;

  // Base: raw size delta normalized (1 point per 10KB)
  score += Math.abs(anomaly.sizeDelta) / (10 * 1024);

  // Boost named user constructors
  if (USER_NAME_PATTERNS.some(p => p.test(anomaly.name))) {
    score += 50;
  }

  // Penalize generic runtime buckets
  if (GENERIC_TYPES.has(anomaly.name)) {
    score -= 30;
  }

  // Boost anomalies with retainer chains
  if (retainerInfo && retainerInfo.chains && retainerInfo.chains.length > 0) {
    score += 20;
    // Extra boost for root-reaching chains
    if (retainerInfo.chains.some(c => c.reachesRoot)) {
      score += 15;
    }
  }

  // Boost growing anomalies over shrinking
  if (anomaly.sizeDelta > 0) {
    score += 10;
  }

  return score;
}

/**
 * Re-rank anomalies by actionability rather than raw size delta.
 *
 * This is a post-processing layer: the raw diff output stays unchanged.
 * The display/LLM summary uses this ranked version.
 *
 * @param {Array} diffs - Output of diffSnapshots()
 * @param {Array} [retainerResults] - Output of walkRetainers()
 * @returns {Array} Re-ranked diffs with actionabilityScore added
 */
export function rankAnomalies(diffs, retainerResults = []) {
  const retainerMap = new Map();
  for (const r of retainerResults) {
    retainerMap.set(r.anomaly, r);
  }

  const scored = diffs.map(d => ({
    ...d,
    actionabilityScore: computeActionabilityScore(d, retainerMap.get(d.name)),
  }));

  scored.sort((a, b) => b.actionabilityScore - a.actionabilityScore);
  return scored;
}

/**
 * Run diff as standalone CLI tool.
 *
 * Usage: node diff.mjs <snapshot1.heapsnapshot> <snapshot2.heapsnapshot> [--json output.json] [--top K]
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node diff.mjs <snapshot1> <snapshot2> [--json output.json] [--top K]');
    process.exit(1);
  }

  const file1 = args[0];
  const file2 = args[1];

  // Parse optional flags
  let jsonOutput = null;
  let topK = 15;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--json' && args[i + 1]) {
      jsonOutput = args[++i];
    } else if (args[i] === '--top' && args[i + 1]) {
      topK = parseInt(args[++i], 10);
    }
  }

  console.log(`Parsing snapshot 1: ${file1}`);
  const map1 = parseSnapshot(file1);
  console.log(`  -> ${map1.size} unique constructors`);

  console.log(`Parsing snapshot 2: ${file2}`);
  const map2 = parseSnapshot(file2);
  console.log(`  -> ${map2.size} unique constructors`);

  console.log(`\nComputing diff (top ${topK}, noise floor: ${NOISE_FLOOR_BYTES} bytes)...\n`);
  const diffs = diffSnapshots(map1, map2, { topK });

  if (diffs.length === 0) {
    console.log('No significant memory growth detected between snapshots.');
    return;
  }

  // Output JSON if requested
  if (jsonOutput) {
    const summary = {
      snapshot1: path.resolve(file1),
      snapshot2: path.resolve(file2),
      timestamp: new Date().toISOString(),
      topK,
      noiseFloorBytes: NOISE_FLOOR_BYTES,
      anomalies: diffs,
    };
    fs.writeFileSync(jsonOutput, JSON.stringify(summary, null, 2));
    console.log(`JSON summary written to: ${jsonOutput}`);
  }

  // Print raw diff to stdout (render.mjs handles pretty formatting)
  console.log(JSON.stringify(diffs, null, 2));
}

// Run as CLI if executed directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
if (isMain) {
  main();
}
