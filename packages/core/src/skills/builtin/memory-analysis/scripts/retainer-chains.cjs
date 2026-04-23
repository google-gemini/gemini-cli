/**
 * retainer-chains.cjs — Walk V8 heap edges backward from leaked objects to GC roots.
 * Prototype for GSoC 2026 proposal: https://github.com/google-gemini/gemini-cli/issues/23365
 *
 * This goes beyond detecting WHAT leaked — it shows WHY objects can't be GC'd
 * by tracing the retention path from each leaked object back to a GC root.
 *
 * Usage:
 *   node retainer-chains.cjs --snapshot=<s3.heapsnapshot> --leaked-ids=<ids.json> [--max-depth=8] [--max-chains=10]
 *
 * Or pipe leaked IDs from diff-snapshots.cjs:
 *   node diff-snapshots.cjs --s1=a --s2=b --s3=c --emit-ids | node retainer-chains.cjs --snapshot=c
 *
 * Zero external dependencies. Uses only node:fs, node:path.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// ─── Helpers ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes < 0) return `-${formatBytes(-bytes)}`;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const MAX_SIZE = 200 * 1024 * 1024;

// V8 internal types — edges through these are noise, not root causes
const INTERNAL_EDGE_SKIP = new Set([
  '(object shape)', '(hidden)', '(code)', 'CodeRelocationInfo',
  'FeedbackVector', 'BytecodeArray', '(number)', '(bigint)', '(symbol)',
]);

// ─── Full graph loader ──────────────────────────────────────────────────────────

/**
 * Load a .heapsnapshot and build the full node + reverse-edge graph.
 * Returns:
 *   nodes[]     — array of { id, idx, ctor, type, self, edgeStart, edgeCount }
 *   idToIdx     — Map<nodeId, arrayIndex>
 *   reverseAdj  — Map<nodeIdx, [{fromIdx, edgeName, edgeType}]>  (child → parents)
 *   rootIdx     — index of the synthetic GC root node (always node 0)
 */
function loadHeapGraph(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_SIZE) {
    throw new Error(`File too large: ${formatBytes(stat.size)}. Max: ${formatBytes(MAX_SIZE)}`);
  }

  const snap = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const meta = snap.snapshot && snap.snapshot.meta;
  if (!meta || !meta.node_fields || !meta.edge_fields || !snap.nodes || !snap.edges || !snap.strings) {
    throw new Error(`Not a valid .heapsnapshot: ${path.basename(filePath)}`);
  }

  const strings   = snap.strings;
  const rawNodes  = snap.nodes;
  const rawEdges  = snap.edges;

  // ── Node field layout ──
  const nf  = meta.node_fields;
  const nfc = nf.length;
  const ni  = Object.fromEntries(nf.map((f, i) => [f, i]));
  const nodeTypes = (meta.node_types && meta.node_types[0]) || [];

  // ── Edge field layout ──
  const ef  = meta.edge_fields;
  const efc = ef.length;
  const ei  = Object.fromEntries(ef.map((f, i) => [f, i]));
  const edgeTypes = (meta.edge_types && meta.edge_types[0]) || [];

  const nodeCount = rawNodes.length / nfc;
  const edgeCount = rawEdges.length / efc;

  // ── Build node array ──
  const nodes   = new Array(nodeCount);
  const idToIdx = new Map();

  // First pass: read all nodes and compute edge start offsets
  // V8 stores edge_count per node; edges are stored contiguously in order
  let edgeOffset = 0;
  for (let i = 0; i < nodeCount; i++) {
    const o      = i * nfc;
    const typeId = rawNodes[o + ni.type];
    const nameId = rawNodes[o + ni.name];
    const id     = rawNodes[o + ni.id];
    const self   = rawNodes[o + ni.self_size];
    const ec     = rawNodes[o + ni.edge_count];

    const typeName = nodeTypes[typeId] || 'unknown';
    const name     = strings[nameId] || '(unknown)';
    const ctor     = (typeName === 'object' || typeName === 'closure') ? name : `(${typeName})`;

    nodes[i] = { id, idx: i, ctor, type: typeName, self, edgeStart: edgeOffset, edgeCount: ec };
    idToIdx.set(id, i);
    edgeOffset += ec;
  }

  // ── Build reverse adjacency list (child → parent edges) ──
  // This is the key data structure for retainer chain analysis.
  // For each edge in the heap (parent → child), we store it as (child ← parent).
  const reverseAdj = new Map();

  edgeOffset = 0;
  for (let parentIdx = 0; parentIdx < nodeCount; parentIdx++) {
    const node = nodes[parentIdx];
    for (let e = 0; e < node.edgeCount; e++) {
      const eo       = (edgeOffset + e) * efc;
      const eTypeId  = rawEdges[eo + ei.type];
      const eNameIdx = rawEdges[eo + ei.name_or_index];
      const toNode   = rawEdges[eo + ei.to_node]; // byte offset into nodes array

      const childIdx = toNode / nfc;
      const edgeType = edgeTypes[eTypeId] || 'unknown';

      // Edge name: for "element" edges it's a numeric index, for others it's a string
      let edgeName;
      if (edgeType === 'element' || edgeType === 'hidden') {
        edgeName = `[${eNameIdx}]`;
      } else {
        edgeName = strings[eNameIdx] || `[${eNameIdx}]`;
      }

      if (!reverseAdj.has(childIdx)) reverseAdj.set(childIdx, []);
      reverseAdj.get(childIdx).push({
        fromIdx: parentIdx,
        edgeName,
        edgeType,
      });
    }
    edgeOffset += node.edgeCount;
  }

  return { nodes, idToIdx, reverseAdj, rootIdx: 0 };
}

// ─── BFS retainer chain walker ──────────────────────────────────────────────────

/**
 * Walk backward from a leaked object to the nearest GC root(s) via BFS.
 * Returns an array of retention paths, each path is an array of steps:
 *   [{ ctor, id, self, edgeName, edgeType }, ...]
 *
 * Each path starts at the leaked object and ends at a GC root (or max depth).
 */
function findRetainerChains(graph, startIdx, maxDepth = 8, maxPaths = 3) {
  const { nodes, reverseAdj, rootIdx } = graph;
  const startNode = nodes[startIdx];
  if (!startNode) return [];

  // BFS state: queue of { nodeIdx, path[] }
  const queue   = [{ nodeIdx: startIdx, path: [] }];
  const visited = new Set([startIdx]);
  const results = [];

  while (queue.length > 0 && results.length < maxPaths) {
    const { nodeIdx, path: currentPath } = queue.shift();
    const node = nodes[nodeIdx];

    // Build current step
    const step = {
      constructor: node.ctor,
      id: node.id,
      self_size: node.self,
    };

    const fullPath = [...currentPath, step];

    // Reached a GC root?
    if (nodeIdx === rootIdx || node.type === 'synthetic') {
      results.push(fullPath);
      continue;
    }

    // Depth limit reached — report partial chain
    if (fullPath.length >= maxDepth) {
      results.push([...fullPath, { constructor: '(truncated at depth ' + maxDepth + ')', id: 0, self_size: 0 }]);
      continue;
    }

    // Get parent edges (who retains this node?)
    const parents = reverseAdj.get(nodeIdx) || [];

    // Sort: prefer named edges > element edges > hidden/internal
    const sorted = parents
      .filter((p) => !INTERNAL_EDGE_SKIP.has(nodes[p.fromIdx].ctor))
      .sort((a, b) => {
        // Prefer property/shortcut edges over element/hidden
        const rank = (e) =>
          e.edgeType === 'property' ? 0 :
          e.edgeType === 'shortcut' ? 1 :
          e.edgeType === 'context'  ? 2 :
          e.edgeType === 'element'  ? 3 : 4;
        return rank(a) - rank(b);
      });

    // Take top candidates to avoid explosive branching
    let expanded = 0;
    for (const parent of sorted) {
      if (expanded >= 3) break; // branching cap per level
      if (visited.has(parent.fromIdx)) continue;
      visited.add(parent.fromIdx);

      // Annotate the CURRENT step with how the parent references it
      const annotatedStep = {
        ...step,
        retained_via: parent.edgeName,
        edge_type: parent.edgeType,
      };

      queue.push({
        nodeIdx: parent.fromIdx,
        path: [...currentPath, annotatedStep],
      });
      expanded++;
    }
  }

  return results;
}

// ─── Root cause pattern detection ───────────────────────────────────────────────

/**
 * Analyze a set of retainer chains and classify the leak pattern.
 * Returns { pattern, confidence, evidence, suggestion }.
 */
function classifyLeakPattern(chains) {
  const patterns = [];

  for (const chain of chains) {
    const ctors    = chain.map((s) => s.constructor);
    const edges    = chain.map((s) => s.retained_via || '').filter(Boolean);
    const pathStr  = ctors.join(' → ');
    const combined = `${pathStr} ${edges.join(' ')}`.toLowerCase();

    // Event listener leak: closures retained via an event emitter
    if (combined.includes('listener') || combined.includes('_events') || combined.includes('eventemitter') ||
        edges.some((e) => e.toLowerCase().includes('listener'))) {
      patterns.push({
        pattern: 'event_listener_accumulation',
        confidence: 0.9,
        evidence: `Retention path passes through event listeners: ${pathStr}`,
        suggestion: 'Add corresponding .off() / removeEventListener() in cleanup. Check for .on() calls without matching teardown.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Closure / scope leak: system/Context nodes retain objects
    else if (combined.includes('context') || combined.includes('closure') ||
             ctors.some((c) => c === 'system / Context' || c === '(closure)')) {
      patterns.push({
        pattern: 'closure_scope_capture',
        confidence: 0.85,
        evidence: `Object retained via closure scope (system / Context): ${pathStr}`,
        suggestion: 'The closure captures variables from its enclosing scope. Nullify references after use or use WeakRef to break the retention.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Map / cache without eviction — look for Map, cache, table edges OR Map constructors
    else if (combined.includes('map') || combined.includes('cache') || combined.includes('table') ||
             edges.some((e) => /^(table|cache|store|registry|entries|map)$/i.test(e)) ||
             ctors.some((c) => c === 'Map' || c === 'Set' || c === 'WeakMap')) {
      patterns.push({
        pattern: 'cache_without_eviction',
        confidence: 0.8,
        evidence: `Object retained in a Map/cache structure: ${pathStr}`,
        suggestion: 'The Map/cache grows without bounds. Add LRU eviction, TTL expiry, or switch to WeakMap.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Array accumulation — objects inside arrays that grow without bounds
    else if (edges.some((e) => /^\[\d+\]$/.test(e)) || ctors.some((c) => c === 'Array' || c === '(array)')) {
      patterns.push({
        pattern: 'array_accumulation',
        confidence: 0.75,
        evidence: `Object stored in an ever-growing array: ${pathStr}`,
        suggestion: 'The array is used as an unbounded buffer. Add a size cap, circular buffer, or periodic cleanup.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Timer / interval leak
    else if (combined.includes('timer') || combined.includes('interval') || combined.includes('timeout')) {
      patterns.push({
        pattern: 'timer_leak',
        confidence: 0.85,
        evidence: `Object retained via timer/interval: ${pathStr}`,
        suggestion: 'Store the timer handle and call clearInterval()/clearTimeout() on teardown.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Global reference — short chain to GC root
    else if (chain.length <= 3 || chain.some((s) => s.constructor === '(synthetic)' || s.constructor === 'Window') ||
             combined.includes('global')) {
      patterns.push({
        pattern: 'global_reference',
        confidence: 0.7,
        evidence: `Object directly or near-directly rooted in global scope: ${pathStr}`,
        suggestion: 'Remove the global reference or wrap in a scope that can be cleaned up.',
        chain_summary: formatChainSummary(chain),
      });
    }

    // Fallback
    else {
      patterns.push({
        pattern: 'unknown_retention',
        confidence: 0.5,
        evidence: `Retention path: ${pathStr}`,
        suggestion: 'Inspect the retention path manually — consider breaking the reference at the deepest named edge.',
        chain_summary: formatChainSummary(chain),
      });
    }
  }

  // Deduplicate by pattern type, keep highest confidence
  const byPattern = new Map();
  for (const p of patterns) {
    if (!byPattern.has(p.pattern) || byPattern.get(p.pattern).confidence < p.confidence) {
      byPattern.set(p.pattern, p);
    }
  }

  return [...byPattern.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Format a retainer chain as a compact human-readable string.
 * Example: "Buffer @12345 (1.0KB) ←[body]─ Object @12300 ←[req-42]─ Map @5000 ←[table]─ (GC root)"
 */
function formatChainSummary(chain) {
  return chain.map((step, i) => {
    const size = step.self_size ? ` (${formatBytes(step.self_size)})` : '';
    const id   = step.id ? ` @${step.id}` : '';
    const edge = step.retained_via ? ` ←[${step.retained_via}]─ ` : (i > 0 ? ' ← ' : '');
    return `${i > 0 ? edge : ''}${step.constructor}${id}${size}`;
  }).join('');
}

// ─── Analyze leaked constructors ────────────────────────────────────────────────

/**
 * Main analysis function: given a snapshot and a set of leaked node IDs,
 * find retainer chains and classify leak patterns.
 *
 * @param {string} snapshotPath  - path to S3 .heapsnapshot
 * @param {number[]} leakedIds   - node IDs identified as leaked by diff-snapshots
 * @param {object} [opts]
 * @param {number} [opts.maxDepth=8]     - max BFS depth per chain
 * @param {number} [opts.maxChains=3]    - max chains per leaked constructor
 * @param {number} [opts.maxCtors=8]     - max constructors to analyze
 * @returns {object} Full retainer analysis report
 */
function analyzeRetainerChains(snapshotPath, leakedIds, opts = {}) {
  const maxDepth  = opts.maxDepth  || 8;
  const maxChains = opts.maxChains || 3;
  const maxCtors  = opts.maxCtors  || 8;

  // Load the full heap graph
  const graph = loadHeapGraph(snapshotPath);

  // Group leaked IDs by constructor
  const byCtor = new Map();
  for (const id of leakedIds) {
    const idx = graph.idToIdx.get(id);
    if (idx === undefined) continue;
    const node = graph.nodes[idx];
    if (!byCtor.has(node.ctor)) byCtor.set(node.ctor, []);
    byCtor.get(node.ctor).push(idx);
  }

  // Sort constructors by count (analyze the biggest leakers first)
  const sortedCtors = [...byCtor.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxCtors);

  const results = [];

  for (const [ctor, indices] of sortedCtors) {
    // Sample a few objects per constructor (don't analyze all 5000 Buffers)
    const sampleSize = Math.min(3, indices.length);
    const sampleIndices = indices.slice(0, sampleSize);

    const allChains = [];
    for (const idx of sampleIndices) {
      const chains = findRetainerChains(graph, idx, maxDepth, maxChains);
      allChains.push(...chains);
    }

    // Classify patterns from the collected chains
    const patterns = classifyLeakPattern(allChains);

    const node = graph.nodes[indices[0]];
    results.push({
      constructor: ctor,
      leaked_count: indices.length,
      sample_id: node.id,
      sample_size: formatBytes(node.self),
      retainer_chains: allChains.slice(0, maxChains).map(formatChainSummary),
      root_cause: patterns[0] || {
        pattern: 'unknown',
        confidence: 0,
        suggestion: 'Could not determine root cause — manual inspection needed.',
      },
      all_patterns: patterns,
    });
  }

  return {
    analysis: 'retainer-chain',
    snapshot: path.basename(snapshotPath),
    leaked_ids_analyzed: leakedIds.length,
    constructors_analyzed: results.length,
    results,
    summary: {
      top_pattern: results[0]?.root_cause?.pattern || 'none',
      top_confidence: results[0]?.root_cause?.confidence || 0,
      actionable_suggestions: results
        .map((r) => r.root_cause?.suggestion)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i), // deduplicate
    },
  };
}

// ─── CLI entry point ────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv);

  if (!args.snapshot) {
    console.log(JSON.stringify({
      error: 'Usage: node retainer-chains.cjs --snapshot=<s3.heapsnapshot> --leaked-ids=<ids.json> [--max-depth=8]',
    }, null, 2));
    process.exit(1);
  }

  const snapshotPath = path.resolve(args.snapshot);
  if (!fs.existsSync(snapshotPath)) {
    console.log(JSON.stringify({ error: `Snapshot not found: ${snapshotPath}` }, null, 2));
    process.exit(1);
  }

  let leakedIds;

  if (args['leaked-ids']) {
    // Read from file
    const idsPath = path.resolve(args['leaked-ids']);
    if (!fs.existsSync(idsPath)) {
      console.log(JSON.stringify({ error: `Leaked IDs file not found: ${idsPath}` }, null, 2));
      process.exit(1);
    }
    leakedIds = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  } else {
    // Read from stdin
    const chunks = [];
    const fd = fs.openSync('/dev/stdin', 'r');
    const buf = Buffer.alloc(65536);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf)) > 0) {
      chunks.push(buf.slice(0, bytesRead).toString());
    }
    fs.closeSync(fd);
    leakedIds = JSON.parse(chunks.join(''));
  }

  if (!Array.isArray(leakedIds) || leakedIds.length === 0) {
    console.log(JSON.stringify({ error: 'No leaked IDs provided. Expected a JSON array of node IDs.' }, null, 2));
    process.exit(1);
  }

  const maxDepth  = parseInt(args['max-depth'], 10) || 8;
  const maxChains = parseInt(args['max-chains'], 10) || 3;

  const result = analyzeRetainerChains(snapshotPath, leakedIds, { maxDepth, maxChains });
  console.log(JSON.stringify(result, null, 2));
}

// Export for programmatic use + CLI entry
module.exports = { loadHeapGraph, findRetainerChains, classifyLeakPattern, analyzeRetainerChains };
if (require.main === module) main();
