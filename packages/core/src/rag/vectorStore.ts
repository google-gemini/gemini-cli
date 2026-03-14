/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EmbeddingVector } from './embeddingStrategy.js';

/**
 * A stored entry in the vector index.
 */
export interface VectorEntry {
  /** Stable identifier — typically an absolute file path + chunk offset. */
  id: string;
  /** The raw text this vector was computed from. */
  text: string;
  /** Source file path or URL. */
  source: string;
  /** Dense embedding vector. */
  vector: EmbeddingVector;
}

/**
 * A retrieval result returned by {@link VectorStore.query}.
 */
export interface VectorMatch {
  id: string;
  text: string;
  source: string;
  /** Cosine similarity in [0, 1]. Higher is more similar. */
  score: number;
}

/**
 * Strategy interface for an in-process vector store.
 * Concrete implementations are injected into ContextEngine — following the
 * Strategy pattern so InMemoryVectorStore and SqliteVectorStore are
 * interchangeable without modifying business logic.
 */
export interface VectorStore {
  /**
   * Inserts or replaces an entry. Idempotent on `id`.
   */
  upsert(entry: VectorEntry): void;

  /**
   * Returns the top-K entries whose vectors are most similar to `queryVector`,
   * sorted descending by cosine similarity.
   */
  query(queryVector: EmbeddingVector, topK: number): VectorMatch[];

  /**
   * Removes all entries. Used when re-indexing the workspace from scratch.
   */
  clear(): void;

  /** Number of entries currently in the store. */
  readonly size: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function l2Norm(v: number[]): number {
  return Math.sqrt(dotProduct(v, v));
}

function cosine(a: number[], b: number[]): number {
  const denom = l2Norm(a) * l2Norm(b);
  return denom === 0 ? 0 : dotProduct(a, b) / denom;
}

// ---------------------------------------------------------------------------
// InMemoryVectorStore
// ---------------------------------------------------------------------------

/**
 * A simple in-process vector store using brute-force cosine similarity.
 * Suitable for workspaces up to ~5 000 chunks (< 50 MB RAM).
 * Swap for `SqliteVectorStore` when cross-session persistence is needed.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly entries = new Map<string, VectorEntry>();

  upsert(entry: VectorEntry): void {
    this.entries.set(entry.id, entry);
  }

  query(queryVector: EmbeddingVector, topK: number): VectorMatch[] {
    const qv = queryVector.values;
    const scored: VectorMatch[] = [];

    for (const entry of this.entries.values()) {
      scored.push({
        id: entry.id,
        text: entry.text,
        source: entry.source,
        score: cosine(qv, entry.vector.values),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
