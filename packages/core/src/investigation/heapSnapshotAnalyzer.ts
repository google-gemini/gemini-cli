/**
 * HeapSnapshotAnalyzer — V8 .heapsnapshot parser, differ, and leak detector.
 *
 * Implements the automated 3-snapshot technique for memory leak investigation:
 *   1. Parse V8 heap snapshot JSON into an in-memory graph
 *   2. Compute retained sizes via dominator-tree construction
 *   3. Diff two snapshots to find grown/leaked objects
 *   4. Run the 3-snapshot workflow to isolate true leaks
 *   5. Generate LLM-friendly summaries with retainer chains
 *
 * References:
 *   - V8 heap snapshot format: nodes/edges as flat arrays indexed by meta fields
 *   - 3-Snapshot Technique: https://nicwn.me/v8-heapsnapshot-format/
 *   - Chrome DevTools heap analysis internals
 *
 * @module investigation/heapSnapshotAnalyzer
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Raw V8 .heapsnapshot JSON structure */
export interface RawHeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: unknown[];
      edge_fields: string[];
      edge_types: unknown[];
    };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
  trace_function_infos?: unknown[];
  trace_tree?: unknown[];
  samples?: unknown[];
  locations?: number[];
}

/** Node types defined by V8 */
export type HeapNodeType =
  | 'hidden'
  | 'array'
  | 'string'
  | 'object'
  | 'code'
  | 'closure'
  | 'regexp'
  | 'number'
  | 'native'
  | 'synthetic'
  | 'concatenated string'
  | 'sliced string'
  | 'symbol'
  | 'bigint'
  | 'object shape';

const NODE_TYPES: HeapNodeType[] = [
  'hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp',
  'number', 'native', 'synthetic', 'concatenated string', 'sliced string',
  'symbol', 'bigint', 'object shape',
];

/** Edge types defined by V8 */
export type HeapEdgeType =
  | 'context'
  | 'element'
  | 'property'
  | 'internal'
  | 'hidden'
  | 'shortcut'
  | 'weak';

const EDGE_TYPES: HeapEdgeType[] = [
  'context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak',
];

/** Parsed node with resolved references */
export interface HeapNode {
  index: number;          // ordinal index (0, 1, 2, ...)
  type: HeapNodeType;
  name: string;
  id: number;             // V8 unique node id (stable across snapshots)
  selfSize: number;
  edgeCount: number;
  retainedSize: number;   // computed via dominator tree
  edges: HeapEdge[];      // outgoing edges
  retainers: HeapEdge[];  // incoming edges (reverse graph)
  dominatorId: number;    // dominator node index (-1 if root)
  detachedness: number;
}

/** Parsed edge with resolved references */
export interface HeapEdge {
  type: HeapEdgeType;
  nameOrIndex: string | number;
  fromNode: number;       // node index
  toNode: number;         // node index
}

/** Summary of a class (constructor) in the heap */
export interface ClassSummary {
  className: string;
  count: number;
  shallowSize: number;
  retainedSize: number;
  instances: number[];    // node indices
}

/** Result of diffing two snapshots */
export interface SnapshotDiff {
  added: DiffEntry[];       // objects in snapshot2 not in snapshot1
  removed: DiffEntry[];     // objects in snapshot1 not in snapshot2
  grown: GrowthEntry[];     // classes that grew between snapshots
  totalAdded: number;
  totalRemoved: number;
  netGrowth: number;
}

export interface DiffEntry {
  nodeId: number;
  type: HeapNodeType;
  name: string;
  selfSize: number;
  retainedSize: number;
}

export interface GrowthEntry {
  className: string;
  countDelta: number;
  sizeDelta: number;
  retainedDelta: number;
  newInstances: number[];   // node IDs of new objects
}

/** Retainer chain — path from GC root to a leaked object */
export interface RetainerChain {
  nodeId: number;
  nodeName: string;
  nodeType: HeapNodeType;
  selfSize: number;
  retainedSize: number;
  chain: RetainerStep[];
}

export interface RetainerStep {
  edgeName: string | number;
  edgeType: HeapEdgeType;
  nodeName: string;
  nodeType: HeapNodeType;
  nodeId: number;
}

/** Full leak report from 3-snapshot analysis */
export interface LeakReport {
  timestamp: string;
  snapshotSizes: [number, number, number];
  leakCandidates: LeakCandidate[];
  summary: string;         // LLM-friendly natural language summary
  recommendations: string[];
}

export interface LeakCandidate {
  className: string;
  countInSnapshot1: number;
  countInSnapshot2: number;
  countInSnapshot3: number;
  growthRate: number;       // objects per snapshot interval
  totalLeakedSize: number;
  retainerChains: RetainerChain[];
  confidence: 'high' | 'medium' | 'low';
}

// ─── Analyzer ────────────────────────────────────────────────────────────────

export class HeapSnapshotAnalyzer {
  private nodes: HeapNode[] = [];
  private nodeById: Map<number, number> = new Map();  // V8 id → node index
  private nodeFieldCount = 7;
  private edgeFieldCount = 3;
  private strings: string[] = [];
  private rawSnapshot: RawHeapSnapshot | null = null;

  /**
   * Create a HeapSnapshotAnalyzer.
   * If a raw snapshot is provided, it is parsed immediately.
   * Otherwise, call `parse()` manually.
   */
  constructor(raw?: RawHeapSnapshot) {
    // Guard: if an argument was explicitly passed but is null/undefined,
    // that's almost certainly a bug (e.g. failed JSON.parse).
    // Only skip parse() when called with zero arguments.
    if (arguments.length > 0 && (raw === null || raw === undefined)) {
      throw new Error(
        'Invalid heap snapshot: expected an object, got ' +
        (raw === null ? 'null' : 'undefined') +
        '. If the snapshot came from JSON.parse(), ensure the parse succeeded.'
      );
    }
    if (raw) {
      this.parse(raw);
    }
  }

  /** Number of nodes in the parsed snapshot */
  get nodeCount(): number {
    return this.nodes.length;
  }

  /** Number of edges in the parsed snapshot */
  get edgeCount(): number {
    return this.nodes.reduce((sum, n) => sum + n.edges.length, 0);
  }

  /**
   * Convenience method for class-level summaries.
   * Alias for `getClassSummaries()`.
   */
  classSummary(): ClassSummary[] {
    return this.getClassSummaries();
  }

  /**
   * Parse a raw V8 .heapsnapshot JSON into an in-memory graph.
   * Handles the flat-array format where each node/edge occupies
   * `fieldCount` consecutive slots.
   */
  parse(raw: RawHeapSnapshot): void {
    // Validate input structure
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid heap snapshot: expected an object, got ' + (raw === null ? 'null' : typeof raw));
    }
    if (!raw.snapshot || typeof raw.snapshot !== 'object') {
      throw new Error('Invalid heap snapshot: missing "snapshot" field. This does not appear to be a V8 .heapsnapshot file.');
    }
    if (!raw.snapshot.meta || typeof raw.snapshot.meta !== 'object') {
      throw new Error('Invalid heap snapshot: missing "snapshot.meta" field.');
    }
    if (!Array.isArray(raw.snapshot.meta.node_fields) || raw.snapshot.meta.node_fields.length === 0) {
      throw new Error('Invalid heap snapshot: missing or empty "snapshot.meta.node_fields".');
    }
    if (!Array.isArray(raw.snapshot.meta.edge_fields) || raw.snapshot.meta.edge_fields.length === 0) {
      throw new Error('Invalid heap snapshot: missing or empty "snapshot.meta.edge_fields".');
    }
    if (!Array.isArray(raw.nodes)) {
      throw new Error('Invalid heap snapshot: missing "nodes" array.');
    }
    if (!Array.isArray(raw.edges)) {
      throw new Error('Invalid heap snapshot: missing "edges" array.');
    }
    if (!Array.isArray(raw.strings)) {
      throw new Error('Invalid heap snapshot: missing "strings" array.');
    }

    this.rawSnapshot = raw;
    this.strings = raw.strings;
    this.nodeFieldCount = raw.snapshot.meta.node_fields.length;
    this.edgeFieldCount = raw.snapshot.meta.edge_fields.length;

    const nf = this.nodeFieldCount;
    // node_count might be missing; compute from array length
    const nodeCount = raw.snapshot.node_count ?? Math.floor(raw.nodes.length / nf);
    const ef = this.edgeFieldCount;

    // ── Pass 1: Create all nodes ──
    this.nodes = new Array(nodeCount);
    this.nodeById.clear();

    for (let i = 0; i < nodeCount; i++) {
      const offset = i * nf;
      const typeIdx = raw.nodes[offset];
      const nameIdx = raw.nodes[offset + 1];
      const id = raw.nodes[offset + 2];
      const selfSize = raw.nodes[offset + 3];
      const edgeCount = raw.nodes[offset + 4];
      const detachedness = nf >= 7 ? (raw.nodes[offset + 6] ?? 0) : 0;

      this.nodes[i] = {
        index: i,
        type: NODE_TYPES[typeIdx] ?? 'hidden',
        name: this.strings[nameIdx] ?? `<unknown:${nameIdx}>`,
        id,
        selfSize,
        edgeCount,
        retainedSize: selfSize, // will be updated by dominator tree
        edges: [],
        retainers: [],
        dominatorId: -1,
        detachedness,
      };
      this.nodeById.set(id, i);
    }

    // ── Pass 2: Parse edges and link to nodes ──
    let edgeOffset = 0;
    for (let i = 0; i < nodeCount; i++) {
      const node = this.nodes[i];
      for (let e = 0; e < node.edgeCount; e++) {
        const rawOffset = edgeOffset * ef;
        const edgeTypeIdx = raw.edges[rawOffset];
        const nameOrIndexRaw = raw.edges[rawOffset + 1];
        const toNodeOffset = raw.edges[rawOffset + 2];
        const toNodeIdx = toNodeOffset / nf;

        const edgeType = EDGE_TYPES[edgeTypeIdx] ?? 'internal';

        // Edge name: string index for property/context/shortcut/internal,
        // numeric index for element edges
        let nameOrIndex: string | number;
        if (edgeType === 'element' || edgeType === 'hidden') {
          nameOrIndex = nameOrIndexRaw;
        } else {
          nameOrIndex = this.strings[nameOrIndexRaw] ?? `<edge:${nameOrIndexRaw}>`;
        }

        const edge: HeapEdge = {
          type: edgeType,
          nameOrIndex,
          fromNode: i,
          toNode: toNodeIdx,
        };

        node.edges.push(edge);

        // Build reverse graph
        // BUG FIX #14: Also guard against negative and non-integer indices
        // which can occur with corrupt/truncated snapshots where the raw
        // edge offset doesn't align with node field count.
        if (toNodeIdx >= 0 && toNodeIdx < nodeCount && Number.isInteger(toNodeIdx)) {
          this.nodes[toNodeIdx].retainers.push(edge);
        }

        edgeOffset++;
      }
    }

    // ── Pass 3: Compute dominator tree and retained sizes ──
    this.computeDominatorTree();
  }

  /**
   * Compute the dominator tree using the iterative algorithm.
   * A dominator of node N is a node D such that every path from the root
   * to N must go through D. The immediate dominator is the closest such node.
   *
   * After computing dominators, retained size = selfSize + sum of retained
   * sizes of all dominated children (post-order traversal).
   */
  private computeDominatorTree(): void {
    const n = this.nodes.length;
    if (n === 0) return;

    // Initialize: root dominates itself, all others undefined (-1)
    const doms = new Int32Array(n).fill(-1);
    doms[0] = 0;

    // Build predecessors list (non-weak, non-shortcut edges only)
    const preds: number[][] = new Array(n);
    for (let i = 0; i < n; i++) preds[i] = [];

    for (const node of this.nodes) {
      for (const edge of node.edges) {
        if (edge.type !== 'weak' && edge.type !== 'shortcut' && edge.toNode < n) {
          preds[edge.toNode].push(node.index);
        }
      }
    }

    // BFS order for iteration
    const order = this.bfsOrder();

    // Pre-compute order index lookup (O(n) once, not O(n) per intersect call)
    const orderIndex = new Int32Array(n).fill(-1);
    for (let i = 0; i < order.length; i++) {
      orderIndex[order[i]] = i;
    }

    // Iterative dominator computation (Cooper et al.)
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      for (const nodeIdx of order) {
        if (nodeIdx === 0) continue;

        let newIdom = -1;
        for (const pred of preds[nodeIdx]) {
          if (doms[pred] === -1) continue;
          if (newIdom === -1) {
            newIdom = pred;
          } else {
            newIdom = this.intersectFast(doms, newIdom, pred, orderIndex);
          }
        }

        if (newIdom !== -1 && doms[nodeIdx] !== newIdom) {
          doms[nodeIdx] = newIdom;
          changed = true;
        }
      }
    }

    // Store dominators
    for (let i = 0; i < n; i++) {
      this.nodes[i].dominatorId = doms[i];
    }

    // Compute retained sizes (post-order: children before parents)
    // Build dominator tree children list
    const domChildren: number[][] = new Array(n);
    for (let i = 0; i < n; i++) domChildren[i] = [];
    for (let i = 1; i < n; i++) {
      if (doms[i] >= 0 && doms[i] !== i) {
        domChildren[doms[i]].push(i);
      }
    }

    // Post-order traversal using iterative DFS
    const visited = new Uint8Array(n);
    const stack: Array<{ node: number; phase: 'enter' | 'exit' }> = [{ node: 0, phase: 'enter' }];

    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item.phase === 'exit') {
        // Sum up children's retained sizes
        for (const child of domChildren[item.node]) {
          this.nodes[item.node].retainedSize += this.nodes[child].retainedSize;
        }
        continue;
      }

      if (visited[item.node]) continue;
      visited[item.node] = 1;

      stack.push({ node: item.node, phase: 'exit' });
      for (const child of domChildren[item.node]) {
        if (!visited[child]) {
          stack.push({ node: child, phase: 'enter' });
        }
      }
    }
  }

  /** BFS ordering from root (node 0) — uses ring buffer for O(1) dequeue */
  private bfsOrder(): number[] {
    const n = this.nodes.length;
    const visited = new Uint8Array(n);
    const order: number[] = [];

    // Ring buffer for O(1) dequeue instead of Array.shift() which is O(n)
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    queue[tail++] = 0;
    visited[0] = 1;

    while (head < tail) {
      const current = queue[head++];
      order.push(current);

      for (const edge of this.nodes[current].edges) {
        if (edge.type !== 'weak' && edge.type !== 'shortcut' && !visited[edge.toNode] && edge.toNode < n) {
          visited[edge.toNode] = 1;
          queue[tail++] = edge.toNode;
        }
      }
    }
    return order;
  }

  /**
   * Fast intersect helper for dominator computation.
   * Uses pre-computed orderIndex array instead of creating a Map per call.
   */
  private intersectFast(doms: Int32Array, a: number, b: number, orderIndex: Int32Array): number {
    let finger1 = a;
    let finger2 = b;

    while (finger1 !== finger2) {
      while (orderIndex[finger1] > orderIndex[finger2]) {
        finger1 = doms[finger1];
        if (finger1 === -1) return finger2;
      }
      while (orderIndex[finger2] > orderIndex[finger1]) {
        finger2 = doms[finger2];
        if (finger2 === -1) return finger1;
      }
    }
    return finger1;
  }

  // ─── Query API ──────────────────────────────────────────────────────────

  /** Get all parsed nodes */
  getNodes(): ReadonlyArray<HeapNode> {
    return this.nodes;
  }

  /** Get a node by its V8-stable id */
  getNodeById(id: number): HeapNode | undefined {
    const idx = this.nodeById.get(id);
    return idx !== undefined ? this.nodes[idx] : undefined;
  }

  /** Get a node by its ordinal index */
  getNodeByIndex(index: number): HeapNode | undefined {
    return this.nodes[index];
  }

  /** Total heap size (sum of all self sizes) */
  getTotalSize(): number {
    return this.nodes.reduce((sum, n) => sum + n.selfSize, 0);
  }

  /** Group nodes by constructor name and aggregate stats */
  getClassSummaries(): ClassSummary[] {
    const classes = new Map<string, ClassSummary>();

    for (const node of this.nodes) {
      // Use object type + name as class key
      const className = node.type === 'object' ? node.name : `(${node.type})`;

      let entry = classes.get(className);
      if (!entry) {
        entry = { className, count: 0, shallowSize: 0, retainedSize: 0, instances: [] };
        classes.set(className, entry);
      }
      entry.count++;
      entry.shallowSize += node.selfSize;
      entry.retainedSize += node.retainedSize;
      entry.instances.push(node.index);
    }

    return Array.from(classes.values()).sort((a, b) => b.retainedSize - a.retainedSize);
  }

  /** Find top N objects by retained size */
  getTopRetainers(n: number = 20): HeapNode[] {
    return [...this.nodes]
      .sort((a, b) => b.retainedSize - a.retainedSize)
      .slice(0, n);
  }

  /** Build a retainer chain from a node back to the GC root */
  getRetainerChain(nodeIndex: number, maxDepth: number = 10): RetainerChain | undefined {
    const node = this.nodes[nodeIndex];
    if (!node) return undefined;

    const chain: RetainerStep[] = [];
    const visited = new Set<number>();
    let current = nodeIndex;

    while (current !== 0 && chain.length < maxDepth) {
      if (visited.has(current)) break;
      visited.add(current);

      const currentNode = this.nodes[current];
      if (!currentNode || currentNode.retainers.length === 0) break;

      // Pick the strongest retainer (largest retained size, non-weak)
      const retainer = currentNode.retainers
        .filter(e => e.type !== 'weak' && e.type !== 'shortcut')
        .sort((a, b) => (this.nodes[b.fromNode]?.retainedSize ?? 0) - (this.nodes[a.fromNode]?.retainedSize ?? 0))
        [0];

      if (!retainer) break;

      const retainerNode = this.nodes[retainer.fromNode];
      chain.push({
        edgeName: retainer.nameOrIndex,
        edgeType: retainer.type,
        nodeName: retainerNode.name,
        nodeType: retainerNode.type,
        nodeId: retainerNode.id,
      });

      current = retainer.fromNode;
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      selfSize: node.selfSize,
      retainedSize: node.retainedSize,
      chain,
    };
  }

  /** Find detached DOM nodes (detachedness > 0) */
  getDetachedNodes(): HeapNode[] {
    return this.nodes.filter(n => n.detachedness > 0 && n.selfSize > 0);
  }

  // ─── Diffing ────────────────────────────────────────────────────────────

  /**
   * Diff two parsed snapshots. Compares by V8 node id (stable across snapshots).
   * Returns added objects, removed objects, and classes that grew.
   */
  static diff(snapshot1: HeapSnapshotAnalyzer, snapshot2: HeapSnapshotAnalyzer): SnapshotDiff {
    const ids1 = new Map<number, HeapNode>();
    const ids2 = new Map<number, HeapNode>();

    for (const node of snapshot1.getNodes()) ids1.set(node.id, node);
    for (const node of snapshot2.getNodes()) ids2.set(node.id, node);

    const added: DiffEntry[] = [];
    const removed: DiffEntry[] = [];

    // Objects in snapshot2 not in snapshot1
    for (const [id, node] of ids2) {
      if (!ids1.has(id)) {
        added.push({
          nodeId: id,
          type: node.type,
          name: node.name,
          selfSize: node.selfSize,
          retainedSize: node.retainedSize,
        });
      }
    }

    // Objects in snapshot1 not in snapshot2
    for (const [id, node] of ids1) {
      if (!ids2.has(id)) {
        removed.push({
          nodeId: id,
          type: node.type,
          name: node.name,
          selfSize: node.selfSize,
          retainedSize: node.retainedSize,
        });
      }
    }

    // Class-level growth analysis
    const classes1 = snapshot1.getClassSummaries();
    const classes2 = snapshot2.getClassSummaries();
    const classMap1 = new Map(classes1.map(c => [c.className, c]));

    const grown: GrowthEntry[] = [];
    for (const cls2 of classes2) {
      const cls1 = classMap1.get(cls2.className);
      const countDelta = cls2.count - (cls1?.count ?? 0);
      const sizeDelta = cls2.shallowSize - (cls1?.shallowSize ?? 0);
      const retainedDelta = cls2.retainedSize - (cls1?.retainedSize ?? 0);

      if (countDelta > 0 && sizeDelta > 0) {
        // Find which specific instances are new
        const oldIds = new Set(
          (cls1?.instances ?? []).map(idx => snapshot1.getNodeByIndex(idx)?.id).filter(Boolean)
        );
        const newInstances = cls2.instances
          .map(idx => snapshot2.getNodeByIndex(idx)!)
          .filter(node => node && !oldIds.has(node.id))
          .map(node => node.id);

        grown.push({ className: cls2.className, countDelta, sizeDelta, retainedDelta, newInstances });
      }
    }

    grown.sort((a, b) => b.retainedDelta - a.retainedDelta);

    const totalAdded = added.reduce((s, e) => s + e.selfSize, 0);
    const totalRemoved = removed.reduce((s, e) => s + e.selfSize, 0);

    return {
      added,
      removed,
      grown,
      totalAdded,
      totalRemoved,
      netGrowth: totalAdded - totalRemoved,
    };
  }

  // ─── 3-Snapshot Technique ───────────────────────────────────────────────

  /**
   * Run the automated 3-snapshot leak detection.
   *
   * The technique:
   *   Snapshot 1 (baseline) → run suspected operation → Snapshot 2 →
   *   run again → Snapshot 3
   *
   * True leaks: objects that appear in snapshot 2 AND grow further in
   * snapshot 3 (consistent growth pattern, not one-time allocations).
   */
  static detectLeaks(
    snapshot1: HeapSnapshotAnalyzer,
    snapshot2: HeapSnapshotAnalyzer,
    snapshot3: HeapSnapshotAnalyzer,
  ): LeakReport {
    const diff12 = HeapSnapshotAnalyzer.diff(snapshot1, snapshot2);
    const diff23 = HeapSnapshotAnalyzer.diff(snapshot2, snapshot3);

    const leakCandidates: LeakCandidate[] = [];

    // Find classes that grew in BOTH diffs (consistent growth = leak signal)
    const growthMap12 = new Map(diff12.grown.map(g => [g.className, g]));

    for (const growth23 of diff23.grown) {
      const growth12 = growthMap12.get(growth23.className);
      if (!growth12) continue;

      // Consistent growth in both intervals
      const growthRate = (growth12.countDelta + growth23.countDelta) / 2;

      // Get class summaries for each snapshot
      const classes1 = snapshot1.getClassSummaries().find(c => c.className === growth23.className);
      const classes2 = snapshot2.getClassSummaries().find(c => c.className === growth23.className);
      const classes3 = snapshot3.getClassSummaries().find(c => c.className === growth23.className);

      // Build retainer chains for new instances in snapshot 3
      const retainerChains: RetainerChain[] = [];
      for (const nodeId of growth23.newInstances.slice(0, 5)) {
        const nodeIdx = snapshot3.nodeById.get(nodeId);
        if (nodeIdx !== undefined) {
          const chain = snapshot3.getRetainerChain(nodeIdx);
          if (chain) retainerChains.push(chain);
        }
      }

      // Confidence: high if both intervals show similar growth
      const ratio = Math.min(growth12.countDelta, growth23.countDelta) /
                    Math.max(growth12.countDelta, growth23.countDelta);
      const confidence = ratio > 0.5 ? 'high' : ratio > 0.2 ? 'medium' : 'low';

      leakCandidates.push({
        className: growth23.className,
        countInSnapshot1: classes1?.count ?? 0,
        countInSnapshot2: classes2?.count ?? 0,
        countInSnapshot3: classes3?.count ?? 0,
        growthRate,
        totalLeakedSize: growth12.sizeDelta + growth23.sizeDelta,
        retainerChains,
        confidence,
      });
    }

    leakCandidates.sort((a, b) => {
      const confOrder = { high: 3, medium: 2, low: 1 };
      return (confOrder[b.confidence] - confOrder[a.confidence]) ||
             (b.totalLeakedSize - a.totalLeakedSize);
    });

    const size1 = snapshot1.getTotalSize();
    const size2 = snapshot2.getTotalSize();
    const size3 = snapshot3.getTotalSize();

    return {
      timestamp: new Date().toISOString(),
      snapshotSizes: [size1, size2, size3],
      leakCandidates,
      summary: HeapSnapshotAnalyzer.generateLeakSummary(leakCandidates, [size1, size2, size3]),
      recommendations: HeapSnapshotAnalyzer.generateRecommendations(leakCandidates),
    };
  }

  /** Generate a natural-language summary suitable for LLM consumption */
  private static generateLeakSummary(
    candidates: LeakCandidate[],
    sizes: [number, number, number],
  ): string {
    const formatBytes = (b: number) => {
      if (b < 1024) return `${b} B`;
      if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    };

    const lines: string[] = [
      `Heap growth: ${formatBytes(sizes[0])} → ${formatBytes(sizes[1])} → ${formatBytes(sizes[2])} (${formatBytes(sizes[2] - sizes[0])} net increase)`,
    ];

    const highConf = candidates.filter(c => c.confidence === 'high');
    const medConf = candidates.filter(c => c.confidence === 'medium');

    if (highConf.length === 0 && medConf.length === 0) {
      lines.push('No consistent leak patterns detected across the 3 snapshots.');
      lines.push('The heap growth may be caused by legitimate caching or one-time allocations.');
    } else {
      if (highConf.length > 0) {
        lines.push(`\nHigh-confidence leaks (${highConf.length}):`);
        for (const c of highConf.slice(0, 5)) {
          lines.push(`  - ${c.className}: ${c.countInSnapshot1} → ${c.countInSnapshot2} → ${c.countInSnapshot3} instances (${formatBytes(c.totalLeakedSize)} leaked)`);
          if (c.retainerChains.length > 0) {
            const chain = c.retainerChains[0];
            const path = chain.chain.map(s => `${s.nodeName}.${s.edgeName}`).join(' → ');
            lines.push(`    Retained by: ${path || '(root)'}`);
          }
        }
      }

      if (medConf.length > 0) {
        lines.push(`\nMedium-confidence leaks (${medConf.length}):`);
        for (const c of medConf.slice(0, 3)) {
          lines.push(`  - ${c.className}: +${c.growthRate.toFixed(0)} instances/interval (${formatBytes(c.totalLeakedSize)} total)`);
        }
      }
    }

    return lines.join('\n');
  }

  /** Generate actionable recommendations based on leak analysis */
  private static generateRecommendations(candidates: LeakCandidate[]): string[] {
    const recs: string[] = [];

    for (const c of candidates.filter(c => c.confidence === 'high').slice(0, 3)) {
      if (c.retainerChains.length > 0) {
        const chain = c.retainerChains[0];
        const lastStep = chain.chain[chain.chain.length - 1];

        if (lastStep?.edgeType === 'property') {
          recs.push(`Check if ${lastStep.nodeName}.${lastStep.edgeName} is being cleaned up. Consider using WeakRef or nulling the reference when the ${c.className} is no longer needed.`);
        }

        if (chain.chain.some(s => s.nodeName.includes('EventEmitter') || s.edgeName.toString().includes('listener'))) {
          recs.push(`${c.className} appears retained by an event listener. Ensure removeListener/removeAllListeners is called when the object is disposed.`);
        }

        if (chain.chain.some(s => s.nodeName.includes('Map') || s.nodeName.includes('Set'))) {
          recs.push(`${c.className} instances accumulate in a Map/Set. Consider using a WeakMap, adding size limits, or implementing an eviction policy.`);
        }

        if (chain.chain.some(s => s.nodeName.includes('Array'))) {
          recs.push(`${c.className} instances accumulate in an Array. Check if items are being removed after use, or consider a bounded buffer.`);
        }
      }
    }

    if (candidates.some(c => c.retainerChains.some(r => r.chain.some(s => s.nodeType === 'closure')))) {
      recs.push('Closures are retaining leaked objects. Check for anonymous functions capturing variables that should be released.');
    }

    if (recs.length === 0) {
      recs.push('Review the retainer chains above to identify which data structures are accumulating objects.');
      recs.push('Consider running the analysis with a longer interval between snapshots for more conclusive results.');
    }

    return recs;
  }

  // ─── Markdown Export ────────────────────────────────────────────────────

  /** Generate a markdown report for a leak analysis */
  static leakReportToMarkdown(report: LeakReport): string {
    const lines: string[] = [
      '# Memory Leak Investigation Report',
      '',
      `**Timestamp:** ${report.timestamp}`,
      `**Snapshot Sizes:** ${report.snapshotSizes.map(s => `${(s / (1024 * 1024)).toFixed(1)} MB`).join(' → ')}`,
      '',
      '## Summary',
      '',
      report.summary,
      '',
    ];

    if (report.leakCandidates.length > 0) {
      lines.push('## Leak Candidates');
      lines.push('');
      lines.push('| Class | Count (S1→S2→S3) | Growth Rate | Leaked Size | Confidence |');
      lines.push('|-------|------------------|-------------|-------------|------------|');

      for (const c of report.leakCandidates) {
        const counts = `${c.countInSnapshot1} → ${c.countInSnapshot2} → ${c.countInSnapshot3}`;
        const size = c.totalLeakedSize < 1024 ? `${c.totalLeakedSize} B` :
                     c.totalLeakedSize < 1024 * 1024 ? `${(c.totalLeakedSize / 1024).toFixed(1)} KB` :
                     `${(c.totalLeakedSize / (1024 * 1024)).toFixed(1)} MB`;
        lines.push(`| ${c.className} | ${counts} | +${c.growthRate.toFixed(0)}/interval | ${size} | ${c.confidence} |`);
      }

      lines.push('');
      lines.push('## Retainer Chains');
      lines.push('');

      for (const c of report.leakCandidates.filter(c => c.retainerChains.length > 0)) {
        lines.push(`### ${c.className}`);
        for (const chain of c.retainerChains.slice(0, 3)) {
          const path = chain.chain.map(s => `\`${s.nodeName}\` --[${s.edgeName}]-->`).join(' ');
          lines.push(`- \`${chain.nodeName}\` ← ${path} (root)`);
        }
        lines.push('');
      }
    }

    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }
}
