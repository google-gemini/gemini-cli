/* global console, process, URL */
/**
 * retainers.mjs — Retainer Chain Walker for V8 Heap Snapshots
 *
 * Performs backward BFS from anomalous constructor instances through
 * the edge graph to identify why objects survive garbage collection.
 *
 * Uses dynamic field indexing from snapshot.meta.*_fields — never
 * hardcodes V8 offsets.
 *
 * Zero external dependencies. Requires Node.js >= 20.
 *
 * @license Apache-2.0
 */

// ── Edge type priority for traversal ordering ──
const EDGE_PRIORITY = {
  context: 0,
  property: 1,
  element: 2,
  internal: 3,
  hidden: 4,
  shortcut: 5,
};

// ── Heuristic patterns for user-code names ──
const USER_CODE_PATTERNS = [
  /^[A-Z][a-z]/, // PascalCase constructors
  /Handler$/,
  /Manager$/,
  /Service$/,
  /Context$/,
  /Controller$/,
  /Provider$/,
  /Factory$/,
  /Listener$/,
  /Callback$/,
];

/**
 * Build a node index from a raw V8 heap snapshot.
 *
 * Returns an object with:
 * - nodeCount: total number of nodes
 * - stride: fields per node
 * - field offsets for type, name, id, self_size, edge_count
 * - nodeTypes: array of type name strings
 * - the raw arrays (nodes, edges, strings) for downstream use
 *
 * @param {Object} snapshot - Parsed V8 .heapsnapshot JSON
 * @returns {Object} nodeIndex
 */
export function buildNodeIndex(snapshot) {
  const meta = snapshot.snapshot?.meta;
  if (!meta?.node_fields) {
    throw new Error('Invalid snapshot: missing snapshot.meta.node_fields');
  }
  if (!meta?.edge_fields) {
    throw new Error('Invalid snapshot: missing snapshot.meta.edge_fields');
  }
  if (!snapshot.nodes || !snapshot.strings) {
    throw new Error('Invalid snapshot: missing nodes or strings array');
  }

  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  const nodeStride = nodeFields.length;
  const edgeStride = edgeFields.length;

  // Dynamic node field offsets
  const typeOff = nodeFields.indexOf('type');
  const nameOff = nodeFields.indexOf('name');
  const idOff = nodeFields.indexOf('id');
  const selfSizeOff = nodeFields.indexOf('self_size');
  const edgeCountOff = nodeFields.indexOf('edge_count');

  if (nameOff === -1 || selfSizeOff === -1 || edgeCountOff === -1) {
    throw new Error('Invalid snapshot: missing required fields in node_fields (name, self_size, edge_count)');
  }

  // Dynamic edge field offsets
  const edgeTypeOff = edgeFields.indexOf('type');
  const edgeNameOrIndexOff = edgeFields.indexOf('name_or_index');
  const edgeToNodeOff = edgeFields.indexOf('to_node');

  if (edgeTypeOff === -1 || edgeToNodeOff === -1) {
    throw new Error('Invalid snapshot: missing required fields in edge_fields (type, to_node)');
  }

  // Resolve type name arrays
  const nodeTypes = Array.isArray(meta.node_types?.[0]) ? meta.node_types[0] : [];
  const edgeTypes = Array.isArray(meta.edge_types?.[0]) ? meta.edge_types[0] : [];

  const nodes = snapshot.nodes;
  const edges = snapshot.edges;
  const strings = snapshot.strings;
  const nodeCount = nodes.length / nodeStride;

  // Build per-node metadata: firstEdgeOffset
  // V8 stores edges contiguously; each node's edges start right after
  // the previous node's edges.
  const firstEdgeOffsets = new Array(nodeCount);
  let edgeCursor = 0;
  for (let i = 0; i < nodeCount; i++) {
    firstEdgeOffsets[i] = edgeCursor;
    const nodeOffset = i * nodeStride;
    edgeCursor += nodes[nodeOffset + edgeCountOff] * edgeStride;
  }

  return {
    nodeCount,
    nodeStride,
    edgeStride,
    typeOff,
    nameOff,
    idOff,
    selfSizeOff,
    edgeCountOff,
    edgeTypeOff,
    edgeNameOrIndexOff,
    edgeToNodeOff,
    nodeTypes,
    edgeTypes,
    nodes,
    edges: edges || [],
    strings,
    firstEdgeOffsets,
  };
}

/**
 * Resolve a human-readable name for a node at a given ordinal.
 *
 * @param {Object} nodeIndex
 * @param {number} ordinal
 * @returns {string}
 */
function resolveNodeName(nodeIndex, ordinal) {
  const { nodes, strings, nodeStride, nameOff, typeOff, nodeTypes } = nodeIndex;
  const offset = ordinal * nodeStride;
  const name = strings[nodes[offset + nameOff]] || '';
  const typeId = typeOff !== -1 ? nodes[offset + typeOff] : -1;
  const typeName = typeId >= 0 && typeId < nodeTypes.length ? nodeTypes[typeId] : '';

  if (name) return name;
  if (typeName) return `(${typeName})`;
  return '(unknown)';
}

/**
 * Get the self_size of a node at a given ordinal.
 *
 * @param {Object} nodeIndex
 * @param {number} ordinal
 * @returns {number}
 */
function getNodeSelfSize(nodeIndex, ordinal) {
  const { nodes, nodeStride, selfSizeOff } = nodeIndex;
  return nodes[ordinal * nodeStride + selfSizeOff];
}

/**
 * Check if a node looks like a GC root or synthetic root.
 *
 * Node ordinal 0 is typically the synthetic root in V8 snapshots.
 * Nodes with type "synthetic" are also roots.
 *
 * @param {Object} nodeIndex
 * @param {number} ordinal
 * @returns {boolean}
 */
function isRootLike(nodeIndex, ordinal) {
  if (ordinal === 0) return true;

  const { nodes, nodeStride, typeOff, nodeTypes } = nodeIndex;
  if (typeOff === -1) return false;

  const typeId = nodes[ordinal * nodeStride + typeOff];
  const typeName = typeId >= 0 && typeId < nodeTypes.length ? nodeTypes[typeId] : '';

  return typeName === 'synthetic';
}

/**
 * Build a reverse edge map: for each target node ordinal, store
 * the list of edges that point TO it.
 *
 * @param {Object} snapshot - Parsed V8 .heapsnapshot JSON
 * @param {Object} nodeIndex - Output of buildNodeIndex()
 * @returns {Map<number, Array<{fromOrdinal: number, toOrdinal: number, edgeType: string, edgeName: string}>>}
 */
export function buildReverseEdgeMap(snapshot, nodeIndex) {
  const {
    nodeCount, nodeStride, edgeStride,
    edgeCountOff, edgeTypeOff, edgeNameOrIndexOff, edgeToNodeOff,
    edgeTypes, nodes, edges, strings, firstEdgeOffsets,
  } = nodeIndex;

  const reverseMap = new Map();

  for (let fromOrdinal = 0; fromOrdinal < nodeCount; fromOrdinal++) {
    const nodeOffset = fromOrdinal * nodeStride;
    const edgeCount = nodes[nodeOffset + edgeCountOff];
    const firstEdge = firstEdgeOffsets[fromOrdinal];

    for (let e = 0; e < edgeCount; e++) {
      const edgeOffset = firstEdge + e * edgeStride;

      const edgeTypeId = edges[edgeOffset + edgeTypeOff];
      const edgeType = edgeTypeId >= 0 && edgeTypeId < edgeTypes.length
        ? edgeTypes[edgeTypeId] : 'unknown';

      // to_node is stored as a byte offset into the nodes array;
      // convert to ordinal by dividing by nodeStride
      const toNodeByteOffset = edges[edgeOffset + edgeToNodeOff];
      const toOrdinal = toNodeByteOffset / nodeStride;

      // Resolve edge name
      let edgeName = '';
      if (edgeNameOrIndexOff !== -1) {
        const nameOrIndex = edges[edgeOffset + edgeNameOrIndexOff];
        // For element edges, nameOrIndex is the array index number
        // For named edges, nameOrIndex is a string table index
        if (edgeType === 'element' || edgeType === 'hidden') {
          edgeName = String(nameOrIndex);
        } else {
          edgeName = strings[nameOrIndex] || String(nameOrIndex);
        }
      }

      const entry = {
        fromOrdinal,
        toOrdinal,
        edgeType,
        edgeName,
      };

      if (!reverseMap.has(toOrdinal)) {
        reverseMap.set(toOrdinal, []);
      }
      reverseMap.get(toOrdinal).push(entry);
    }
  }

  return reverseMap;
}

/**
 * Find representative node ordinals for a set of constructor names.
 *
 * For each constructor, finds all matching nodes and returns the top
 * `limitPerType` by selfSize descending.
 *
 * @param {Object} snapshot - Parsed V8 .heapsnapshot JSON
 * @param {string[]} constructorNames - Constructor names to find
 * @param {Object} nodeIndex - Output of buildNodeIndex()
 * @param {number} [limitPerType=3] - Max nodes per constructor
 * @returns {Map<string, number[]>} Map of constructor -> ordinal[]
 */
export function findRepresentativeNodes(snapshot, constructorNames, nodeIndex, limitPerType = 3) {
  const { nodeCount, nodeStride, nameOff, selfSizeOff, nodes, strings } = nodeIndex;
  const targetSet = new Set(constructorNames);
  const candidates = new Map(); // name -> [{ordinal, selfSize}]

  for (let ordinal = 0; ordinal < nodeCount; ordinal++) {
    const offset = ordinal * nodeStride;
    const nameIndex = nodes[offset + nameOff];
    const name = strings[nameIndex] || '';

    if (!targetSet.has(name)) continue;

    const selfSize = nodes[offset + selfSizeOff];
    if (!candidates.has(name)) {
      candidates.set(name, []);
    }
    candidates.get(name).push({ ordinal, selfSize });
  }

  const result = new Map();
  for (const [name, nodes_list] of candidates) {
    // Sort by selfSize descending, take top limitPerType
    nodes_list.sort((a, b) => b.selfSize - a.selfSize);
    result.set(name, nodes_list.slice(0, limitPerType).map(n => n.ordinal));
  }

  return result;
}

/**
 * Score a retainer chain using a deterministic heuristic.
 *
 * Scoring:
 *   +40 if chain reaches root
 *   +20 if contains 'context' edge
 *   +15 if contains 'property' edge
 *   +10 if path names look like user-code names
 *   -20 if mostly internal/hidden edges
 *   -10 per extra hop after depth 3
 *
 * @param {Object} chain
 * @param {boolean} reachesRoot
 * @returns {number}
 */
function scoreChain(chain, reachesRoot) {
  let score = 0;

  if (reachesRoot) score += 40;

  let contextCount = 0;
  let propertyCount = 0;
  let internalHiddenCount = 0;
  let userCodeNameCount = 0;

  for (const step of chain) {
    if (step.edgeType === 'context') contextCount++;
    if (step.edgeType === 'property') propertyCount++;
    if (step.edgeType === 'internal' || step.edgeType === 'hidden') internalHiddenCount++;
    if (USER_CODE_PATTERNS.some(p => p.test(step.from))) userCodeNameCount++;
    if (USER_CODE_PATTERNS.some(p => p.test(step.to))) userCodeNameCount++;
  }

  if (contextCount > 0) score += 20;
  if (propertyCount > 0) score += 15;
  if (userCodeNameCount > 0) score += 10;

  // Penalize if majority of edges are internal/hidden
  if (chain.length > 0 && internalHiddenCount / chain.length > 0.5) {
    score -= 20;
  }

  // Penalize extra hops beyond depth 3
  if (chain.length > 3) {
    score -= 10 * (chain.length - 3);
  }

  return score;
}

/**
 * Walk retainer chains for a set of anomaly constructor names.
 *
 * Performs backward BFS from representative instances of each
 * constructor, building reference paths from GC root to leaked object.
 *
 * @param {Object} snapshot - Parsed V8 .heapsnapshot JSON
 * @param {string[]} constructorNames - Anomaly constructor names
 * @param {Object} [options]
 * @param {number} [options.maxDepth=5] - Maximum chain depth
 * @param {number} [options.maxChainsPerType=3] - Max chains per anomaly
 * @param {number} [options.limitPerType=3] - Max representative nodes
 * @param {boolean} [options.skipWeakEdges=true] - Skip weak reference edges
 * @returns {Array<{anomaly: string, chains: Array}>}
 */
export function walkRetainers(snapshot, constructorNames, options = {}) {
  const {
    maxDepth = 5,
    maxChainsPerType = 3,
    limitPerType = 3,
    skipWeakEdges = true,
  } = options;

  if (!constructorNames || constructorNames.length === 0) {
    return [];
  }

  const nodeIndex = buildNodeIndex(snapshot);
  const reverseMap = buildReverseEdgeMap(snapshot, nodeIndex);
  const representatives = findRepresentativeNodes(snapshot, constructorNames, nodeIndex, limitPerType);

  const results = [];

  for (const constructorName of constructorNames) {
    const ordinals = representatives.get(constructorName);
    if (!ordinals || ordinals.length === 0) {
      results.push({
        anomaly: constructorName,
        chains: [],
      });
      continue;
    }

    const allChains = [];

    for (const startOrdinal of ordinals) {
      // BFS backward from this node toward roots
      // Each queue entry: { ordinal, path: [{from, edgeType, edgeName, to}], visited: Set }
      const queue = [{
        ordinal: startOrdinal,
        path: [],
        visited: new Set([startOrdinal]),
      }];

      // Safety bounds to prevent combinatorial explosion on large graphs
      const MAX_QUEUE_SIZE = 10000;
      const MAX_BRANCHES_PER_NODE = 3;
      let iterations = 0;

      while (queue.length > 0) {
        // Hard stop if queue or iteration count grows too large
        if (iterations++ > MAX_QUEUE_SIZE || allChains.length >= maxChainsPerType * 3) break;

        const current = queue.shift();

        // Check if we reached a root
        if (current.path.length > 0 && isRootLike(nodeIndex, current.ordinal)) {
          const reachesRoot = true;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
          continue;
        }

        // Check depth limit
        if (current.path.length >= maxDepth) {
          // Record a truncated chain
          const reachesRoot = false;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
          continue;
        }

        // Get reverse edges pointing to current node
        const reverseEdges = reverseMap.get(current.ordinal) || [];

        // Sort by edge type priority
        const sortedEdges = [...reverseEdges].sort((a, b) => {
          const pa = EDGE_PRIORITY[a.edgeType] ?? 99;
          const pb = EDGE_PRIORITY[b.edgeType] ?? 99;
          return pa - pb;
        });

        let expanded = false;
        let branchCount = 0;
        for (const edge of sortedEdges) {
          // Limit branches per node to prevent explosion
          if (branchCount >= MAX_BRANCHES_PER_NODE) break;

          // Skip weak edges if configured
          if (skipWeakEdges && edge.edgeType === 'weak') continue;

          // Skip cycles within this path
          if (current.visited.has(edge.fromOrdinal)) continue;

          const fromName = resolveNodeName(nodeIndex, edge.fromOrdinal);
          const toName = resolveNodeName(nodeIndex, current.ordinal);

          const step = {
            from: fromName,
            edgeType: edge.edgeType,
            edgeName: edge.edgeName,
            to: toName,
          };

          const newVisited = new Set(current.visited);
          newVisited.add(edge.fromOrdinal);

          queue.push({
            ordinal: edge.fromOrdinal,
            path: [...current.path, step],
            visited: newVisited,
          });
          expanded = true;
          branchCount++;
        }

        // If no expansion happened and we have a partial path, record it
        if (!expanded && current.path.length > 0) {
          const reachesRoot = false;
          const score = scoreChain(current.path, reachesRoot);
          allChains.push({
            reachesRoot,
            depth: current.path.length,
            score,
            nodes: [...current.path],
          });
        }
      }
    }

    // Sort chains by score descending, take top maxChainsPerType
    allChains.sort((a, b) => b.score - a.score);

    results.push({
      anomaly: constructorName,
      chains: allChains.slice(0, maxChainsPerType),
    });
  }

  return results;
}

// ── CLI entry point ──
import path from 'node:path';

const scriptPath = process.argv[1];
const modulePath = new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
if (scriptPath && path.resolve(scriptPath) === path.resolve(modulePath)) {
  console.log('retainers.mjs — Retainer Chain Walker');
  console.log('This module is designed to be imported, not run directly.');
  console.log('');
  console.log('Exports:');
  console.log('  buildNodeIndex(snapshot)');
  console.log('  buildReverseEdgeMap(snapshot, nodeIndex)');
  console.log('  findRepresentativeNodes(snapshot, constructors, nodeIndex, limit)');
  console.log('  walkRetainers(snapshot, constructors, options)');
}
