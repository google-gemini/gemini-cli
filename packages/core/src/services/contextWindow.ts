/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Union-find context compaction with overlap window and deferred summarization.
 *
 * Reading order for reviewers:
 *   1. cosineSimilarity() — handles mismatched vector dimensions safely
 *   2. Forest class — union-find with path compression, deferred summarization
 *   3. ContextWindow class — overlap window, graduation/eviction
 *   4. Integration: chatCompressionService.ts compactWithUnionFind()
 *
 * v2 architecture:
 * - append() is synchronous — no LLM calls. Graduation triggers structural
 *   union() only.
 * - render() is synchronous — returns cached summaries + hot zone messages.
 * - resolveDirty() is async fire-and-forget — batch-summarizes dirty clusters
 *   in background during main LLM call wait.
 * - Overlap window (graduateAt/evictAt): graduated messages stay in hot zone
 *   for ~2 turns. By the time they evict, background resolveDirty() has
 *   resolved their cluster summaries.
 *
 * Design doc: https://github.com/kimjune01/union-find-compaction-for-gemini-cli/blob/main/transformation-design.md
 */

// -- Interfaces --

export interface Embedder {
  embed(text: string): number[];
  /** Embed without mutating internal state. Used for queries/retrieval. */
  embedQuery?(text: string): number[];
}

export interface Summarizer {
  summarize(messages: string[]): Promise<string>;
}

// -- Data structures --

export interface Message {
  id: number;
  content: string;
  embedding: number[];
  timestamp: string | null;
  _parent: number | null;
  _rank: number;
}

// -- Helpers --

// TF-IDF vocabulary grows over time, so newer vectors are longer than older
// ones. We handle mismatched dimensions by treating missing entries as zero:
// only shared dimensions contribute to the dot product, but trailing dimensions
// still contribute to the norm (lowering similarity, as expected).
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // Include trailing dimensions from the longer vector in its norm
  for (let i = len; i < a.length; i++) {
    normA += a[i] * a[i];
  }
  for (let i = len; i < b.length; i++) {
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0.0;
  return dot / (normA * normB);
}

export function findClosestPair(forest: Forest): [number, number] | null {
  const roots = forest.roots();
  if (roots.length < 2) return null;

  let bestSim = -1.0;
  let bestPair: [number, number] = [roots[0], roots[1]];

  for (let i = 0; i < roots.length; i++) {
    const ca = forest.getCentroid(roots[i]);
    if (!ca) continue;
    for (let j = i + 1; j < roots.length; j++) {
      const cb = forest.getCentroid(roots[j]);
      if (!cb) continue;
      const sim = cosineSimilarity(ca, cb);
      if (sim > bestSim) {
        bestSim = sim;
        bestPair = [roots[i], roots[j]];
      }
    }
  }

  return bestPair;
}

// -- Forest --

export class Forest {
  private _nodes: Map<number, Message> = new Map();
  private _summaries: Map<number, string> = new Map();
  private _children: Map<number, number[]> = new Map();
  private _centroids: Map<number, number[]> = new Map();
  private _dirtyInputs: Map<number, string[]> = new Map();
  private _embedder: Embedder;
  private _summarizer: Summarizer;

  constructor(embedder: Embedder, summarizer: Summarizer) {
    this._embedder = embedder;
    this._summarizer = summarizer;
  }

  insert(
    msgId: number,
    content: string,
    embedding?: number[],
    timestamp?: string | null,
  ): number {
    if (embedding === undefined) {
      embedding = this._embedder.embed(content);
    }
    const msg: Message = {
      id: msgId,
      content,
      embedding,
      timestamp: timestamp ?? null,
      _parent: null,
      _rank: 0,
    };
    this._nodes.set(msgId, msg);
    this._children.set(msgId, [msgId]);
    this._centroids.set(msgId, [...embedding]);
    // Singleton is NOT dirty — raw content serves as compact() output.
    return msgId;
  }

  find(msgId: number): number {
    const node = this._nodes.get(msgId);
    if (!node) throw new Error(`Node ${msgId} not found`);
    if (node._parent === null) return msgId;
    const root = this.find(node._parent);
    node._parent = root; // path compression
    return root;
  }

  /**
   * Synchronous structural merge. No LLM calls.
   * Merges parent pointers, children, centroids.
   * Collects dirty inputs for later batch summarization.
   */
  union(idA: number, idB: number): number {
    let rootA = this.find(idA);
    let rootB = this.find(idB);
    if (rootA === rootB) return rootA;

    let nodeA = this._nodes.get(rootA)!;
    let nodeB = this._nodes.get(rootB)!;

    // Union by rank
    if (nodeA._rank < nodeB._rank) {
      [rootA, rootB] = [rootB, rootA];
      [nodeA, nodeB] = [nodeB, nodeA];
    }
    nodeB._parent = rootA;
    if (nodeA._rank === nodeB._rank) {
      nodeA._rank += 1;
    }

    // Merge children lists
    const membersB = this._children.get(rootB) ?? [];
    this._children.delete(rootB);
    const membersA = this._children.get(rootA) ?? [];
    membersA.push(...membersB);
    this._children.set(rootA, membersA);

    // Update centroid (weighted average)
    const ca = this._centroids.get(rootA);
    const cb = this._centroids.get(rootB);
    this._centroids.delete(rootB);

    if (ca && cb) {
      const na = membersA.length - membersB.length;
      const nb = membersB.length;
      const total = na + nb;
      const maxLen = Math.max(ca.length, cb.length);
      const merged = new Array<number>(maxLen);
      for (let i = 0; i < maxLen; i++) {
        merged[i] = ((ca[i] ?? 0) * na + (cb[i] ?? 0) * nb) / total;
      }
      this._centroids.set(rootA, merged);
    }

    // Collect dirty inputs: what A represents + what B represents
    let inputsA: string[];
    if (this._dirtyInputs.has(rootA)) {
      inputsA = this._dirtyInputs.get(rootA)!;
    } else if (this._summaries.has(rootA)) {
      inputsA = [this._summaries.get(rootA)!];
    } else {
      inputsA = [nodeA.content];
    }

    let inputsB: string[];
    if (this._dirtyInputs.has(rootB)) {
      inputsB = this._dirtyInputs.get(rootB)!;
    } else if (this._summaries.has(rootB)) {
      inputsB = [this._summaries.get(rootB)!];
    } else {
      inputsB = [this._nodes.get(rootB)!.content];
    }

    this._dirtyInputs.set(rootA, [...inputsA, ...inputsB]);
    this._dirtyInputs.delete(rootB);
    this._summaries.delete(rootB);

    return rootA;
  }

  /**
   * Batch-summarize all dirty clusters. One LLM call per dirty root.
   * Called as fire-and-forget after render(), runs during main LLM call wait.
   *
   * Concurrency safety: union() can run between awaits (JS is single-threaded
   * but yields at each await). When union() merges into a dirty root, it
   * replaces _dirtyInputs with a new array containing combined content.
   * We detect this via reference equality (=== check on the inputs array).
   * If the array changed, we skip — the combined entry resolves next call.
   */
  async resolveDirty(): Promise<void> {
    const entries = [...this._dirtyInputs.entries()];
    for (const [root, inputs] of entries) {
      if (!this._dirtyInputs.has(root)) continue;
      const summary = await this._summarizer.summarize(inputs);
      if (this._dirtyInputs.get(root) === inputs) {
        this._summaries.set(root, summary);
        this._dirtyInputs.delete(root);
      }
      // If union() replaced the inputs (merged new content into this root)
      // or merged this root away, skip — the combined dirty entry will be
      // resolved in a future resolveDirty() call.
    }
  }

  /** Whether this cluster has unsummarized content. */
  isDirty(rootId: number): boolean {
    return this._dirtyInputs.has(this.find(rootId));
  }

  /** All roots with unsummarized content. */
  dirtyRoots(): number[] {
    return [...this._dirtyInputs.keys()];
  }

  compact(rootId: number): string {
    const root = this.find(rootId);
    const summary = this._summaries.get(root);
    if (summary === undefined) {
      return this._nodes.get(root)!.content;
    }
    return summary;
  }

  expand(rootId: number): string[] {
    const root = this.find(rootId);
    const memberIds = this._children.get(root) ?? [root];
    return memberIds.map((mid) => this._nodes.get(mid)!.content);
  }

  nearest(
    queryEmbedding: number[],
    k: number = 3,
    minSim: number = 0.0,
  ): number[] {
    const scored: Array<[number, number]> = [];
    for (const root of this._children.keys()) {
      const centroid = this._centroids.get(root);
      if (centroid) {
        const sim = cosineSimilarity(queryEmbedding, centroid);
        if (sim >= minSim) {
          scored.push([sim, root]);
        }
      }
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, k).map(([, root]) => root);
  }

  nearestRoot(queryEmbedding: number[]): [number, number] | null {
    let bestSim = -1.0;
    let bestRoot: number | null = null;
    for (const root of this._children.keys()) {
      const centroid = this._centroids.get(root);
      if (centroid) {
        const sim = cosineSimilarity(queryEmbedding, centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestRoot = root;
        }
      }
    }
    if (bestRoot === null) return null;
    return [bestRoot, bestSim];
  }

  roots(): number[] {
    return [...this._children.keys()];
  }

  members(rootId: number): number[] {
    const root = this.find(rootId);
    return [...(this._children.get(root) ?? [root])];
  }

  summary(rootId: number): string | undefined {
    const root = this.find(rootId);
    return this._summaries.get(root);
  }

  size(): number {
    return this._nodes.size;
  }

  clusterCount(): number {
    return this._children.size;
  }

  getCentroid(rootId: number): number[] | undefined {
    return this._centroids.get(rootId);
  }
}

// -- ContextWindow --

export interface ContextWindowOptions {
  graduateAt?: number;
  evictAt?: number;
  maxColdClusters?: number;
  mergeThreshold?: number;
}

export class ContextWindow {
  private _embedder: Embedder;
  private _forest: Forest;
  private _hot: Message[] = [];
  private _graduateAt: number;
  private _evictAt: number;
  private _maxColdClusters: number;
  private _mergeThreshold: number;
  private _nextId = 0;
  private _graduatedIndex = 0;

  constructor(
    embedder: Embedder,
    summarizer: Summarizer,
    options: ContextWindowOptions = {},
  ) {
    this._embedder = embedder;
    this._forest = new Forest(embedder, summarizer);
    this._graduateAt = options.graduateAt ?? 26;
    this._evictAt = options.evictAt ?? 30;
    this._maxColdClusters = options.maxColdClusters ?? 10;
    this._mergeThreshold = options.mergeThreshold ?? 0.15;
    if (this._evictAt < this._graduateAt) {
      throw new Error(
        `evictAt (${this._evictAt}) must be >= graduateAt (${this._graduateAt})`,
      );
    }
  }

  /**
   * Synchronous append. No LLM calls.
   * Embeds locally (TF-IDF), pushes to hot, graduates and evicts as needed.
   */
  append(content: string, timestamp?: string | null): number {
    const msgId = this._nextId++;
    const embedding = this._embedder.embed(content);
    const msg: Message = {
      id: msgId,
      content,
      embedding,
      timestamp: timestamp ?? null,
      _parent: null,
      _rank: 0,
    };
    this._hot.push(msg);

    // Graduate: ensure ungraduated count <= graduateAt
    while (this._hot.length - this._graduatedIndex > this._graduateAt) {
      this._graduate(this._hot[this._graduatedIndex]);
      this._graduatedIndex++;
    }

    // Evict: ensure hot.length <= evictAt
    while (this._hot.length > this._evictAt) {
      this._hot.shift();
      this._graduatedIndex--;
    }

    return msgId;
  }

  /**
   * Synchronous graduation. No LLM calls.
   * Inserts into forest, merges with nearest cluster if similar enough,
   * enforces hard cap on cluster count.
   */
  private _graduate(msg: Message): void {
    this._forest.insert(msg.id, msg.content, msg.embedding, msg.timestamp);

    if (this._forest.clusterCount() <= 1) return;

    // Find nearest existing e-class (excluding the singleton we just inserted)
    const nearest = this._forest.nearest(msg.embedding, 2);
    if (nearest.length === 0) return;

    const nearestRoot = nearest[0] === msg.id ? nearest[1] : nearest[0];
    if (nearestRoot === undefined) return;

    const centroid = this._forest.getCentroid(nearestRoot);
    if (!centroid) return;
    const sim = cosineSimilarity(msg.embedding, centroid);

    if (sim >= this._mergeThreshold) {
      this._forest.union(msg.id, nearestRoot);
    }

    // Enforce hard cap on cluster count
    while (this._forest.clusterCount() > this._maxColdClusters) {
      const pair = findClosestPair(this._forest);
      if (!pair) break;
      this._forest.union(pair[0], pair[1]);
    }
  }

  /**
   * Synchronous render. No LLM calls.
   * Returns cached cold summaries + hot zone messages.
   * Overlap window ensures graduated messages still appear verbatim from hot.
   */
  render(
    query?: string | null,
    k: number = 3,
    minSim: number = 0.05,
  ): string[] {
    let cold: string[];

    if (query != null && this._forest.clusterCount() > 0) {
      // Use embedQuery (non-mutating) to avoid contaminating the TF-IDF corpus.
      // embed() would add query terms to the vocabulary, changing future embeddings.
      const embedFn = this._embedder.embedQuery ?? this._embedder.embed;
      const queryEmb = embedFn.call(this._embedder, query);
      const topRoots = this._forest.nearest(queryEmb, k, minSim);
      cold = topRoots.map((r) => this._forest.compact(r));
    } else {
      cold = this._forest.roots().map((r) => this._forest.compact(r));
    }

    const hot = this._hot.map((m) => m.content);
    return [...cold, ...hot];
  }

  /**
   * Async fire-and-forget. Batch-summarizes dirty clusters via LLM calls.
   * Called after render(), runs during main LLM call wait.
   */
  async resolveDirty(): Promise<void> {
    await this._forest.resolveDirty();
  }

  expand(rootId: number): string[] {
    return this._forest.expand(rootId);
  }

  get hotCount(): number {
    return this._hot.length;
  }

  get coldClusterCount(): number {
    return this._forest.clusterCount();
  }

  get totalMessages(): number {
    return this._forest.size() + this._hot.length;
  }

  get forest(): Forest {
    return this._forest;
  }
}
