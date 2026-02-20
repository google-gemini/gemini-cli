/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistent vector memory for Gemini Cowork.
 *
 * Architecture
 * ────────────
 *   MemoryStore     — raw CRUD + similarity search over a local JSON store.
 *   MemoryRetriever — higher-level helper that formats results for prompt injection.
 *
 * Storage & Embeddings
 * ─────────────────────
 *   • Entries are persisted as a flat JSON file at:
 *       <projectRoot>/.cowork/memory.json
 *   • When GEMINI_API_KEY is set, each entry is embedded using
 *     Gemini's `text-embedding-004` model and semantic similarity (cosine)
 *     is used for retrieval.
 *   • Without an API key, the store falls back to TF-IDF keyword scoring
 *     so the agent still gets useful context — just less precisely ranked.
 *
 * Memory categories
 * ──────────────────
 *   debugging_session     — stack traces, root-cause analyses, fixes applied
 *   user_preference       — coding style, preferred libraries, naming conventions
 *   architectural_decision — ADRs, chosen patterns, trade-off notes
 *   general               — anything else worth remembering
 *
 * Production upgrade path
 * ───────────────────────
 *   Replace the JSON flat-file backend with @lancedb/lancedb for:
 *     • Disk-efficient columnar storage (Apache Arrow format)
 *     • ANN (approximate nearest-neighbour) search at millions-of-entries scale
 *     • Native full-text + vector hybrid search
 *
 *   The public interface (MemoryStore / MemoryRetriever) is unchanged.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { GoogleGenAI } from '@google/genai';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MemoryCategory =
  | 'debugging_session'
  | 'user_preference'
  | 'architectural_decision'
  | 'general';

export interface MemoryEntry {
  /** Stable unique identifier. */
  id: string;
  /** Free-text content to store and retrieve. */
  content: string;
  category: MemoryCategory;
  /** Arbitrary tags for filtering (e.g. ['typescript', 'auth']). */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  timestamp: string;
  /** Embedding vector — omitted when embeddings are unavailable. */
  vector?: number[];
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  /** Cosine similarity in [0, 1]. 1 = identical. */
  score: number;
}

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Naïve TF-IDF-ish relevance score used when embeddings are unavailable.
 * Counts how many unique query tokens appear in the entry content.
 */
function keywordScore(query: string, content: string): number {
  const qTokens = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2),
  );
  if (qTokens.size === 0) return 0;
  const cLower = content.toLowerCase();
  let hits = 0;
  for (const token of qTokens) {
    if (cLower.includes(token)) hits++;
  }
  return hits / qTokens.size;
}

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

/**
 * Low-level persistent store for agent memories.
 *
 * ```ts
 * const store = new MemoryStore('.cowork/memory.json');
 * await store.load();
 * await store.store('Prefer functional style for reducers', 'user_preference', ['style']);
 * const hits = await store.search('how do reducers work', 5);
 * ```
 */
export class MemoryStore {
  private entries: MemoryEntry[] = [];
  private readonly ai: GoogleGenAI | null;

  constructor(private readonly dbPath: string) {
    const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Load entries from disk. Safe to call when the file does not exist yet. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.dbPath, 'utf-8');
      this.entries = JSON.parse(raw) as MemoryEntry[];
    } catch {
      this.entries = [];
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await writeFile(this.dbPath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  // -------------------------------------------------------------------------
  // Embedding
  // -------------------------------------------------------------------------

  private async embed(text: string): Promise<number[] | null> {
    if (!this.ai) return null;
    try {
      const response = await this.ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      const values = response.embeddings?.[0]?.values;
      return Array.isArray(values) ? (values as number[]) : null;
    } catch {
      return null; // non-fatal: fall back to keyword search
    }
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  /**
   * Persist a new memory entry (embedding is generated automatically).
   */
  async store(
    content: string,
    category: MemoryCategory,
    tags: string[] = [],
  ): Promise<MemoryEntry> {
    const vector = await this.embed(content);
    const entry: MemoryEntry = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      content,
      category,
      tags,
      timestamp: new Date().toISOString(),
      ...(vector ? { vector } : {}),
    };
    this.entries.push(entry);
    await this.persist();
    return entry;
  }

  /** Remove a memory by id. */
  async remove(id: string): Promise<boolean> {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length < before) {
      await this.persist();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Return the top-k most relevant memories for `query`.
   *
   * Uses semantic (cosine) similarity when embeddings are available,
   * keyword overlap otherwise.
   */
  async search(query: string, k = 5): Promise<MemorySearchResult[]> {
    if (this.entries.length === 0) return [];

    const queryVec = await this.embed(query);

    if (queryVec !== null) {
      return this.entries
        .filter((e): e is MemoryEntry & { vector: number[] } => e.vector !== undefined)
        .map((e) => ({ entry: e, score: cosineSimilarity(queryVec, e.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    }

    // Keyword fallback
    return this.entries
      .map((e) => ({ entry: e, score: keywordScore(query, e.content) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** All entries, in insertion order. */
  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.length;
  }
}

// ---------------------------------------------------------------------------
// MemoryRetriever
// ---------------------------------------------------------------------------

/**
 * Higher-level façade over MemoryStore that formats retrieved memories as
 * a Markdown context block ready for injection into a Gemini system prompt
 * or Think step.
 *
 * ```ts
 * const retriever = new MemoryRetriever(store);
 * const ctx = await retriever.retrieve('Fix the auth module');
 * // Prepend ctx to the agent's system prompt or Think context.
 * ```
 */
export class MemoryRetriever {
  constructor(private readonly store: MemoryStore) {}

  /**
   * Search for memories relevant to `goal` and return a formatted Markdown
   * block.  Returns an empty string when no memories are found.
   */
  async retrieve(goal: string, k = 5): Promise<string> {
    const results = await this.store.search(goal, k);
    if (results.length === 0) return '';

    const lines: string[] = [
      '## Relevant Past Context  (from long-term memory)',
      '',
    ];

    for (let i = 0; i < results.length; i++) {
      const { entry, score } = results[i];
      const date = new Date(entry.timestamp).toLocaleDateString();
      const pct = (score * 100).toFixed(0);
      const tagStr = entry.tags.length > 0 ? `  tags: ${entry.tags.join(', ')}` : '';
      lines.push(
        `### [${i + 1}] ${entry.category}  ·  ${date}  ·  similarity ${pct}%${tagStr}`,
        '',
        entry.content,
        '',
      );
    }

    return lines.join('\n');
  }

  /**
   * Convenience: store a memory and immediately return it.
   */
  async remember(
    content: string,
    category: MemoryCategory,
    tags?: string[],
  ): Promise<MemoryEntry> {
    return this.store.store(content, category, tags);
  }
}
