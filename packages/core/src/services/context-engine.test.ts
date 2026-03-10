/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextEngine, type ContentChunk } from './context-engine.js';
import { InMemoryVectorStore } from '../rag/vectorStore.js';
import type {
  EmbeddingStrategy,
  EmbeddingVector,
} from '../rag/embeddingStrategy.js';
import type { Config } from '../config/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a unit vector aligned along dimension `i` of length `dims`. */
function unitVector(i: number, dims = 4): number[] {
  return Array.from({ length: dims }, (_, j) => (j === i ? 1 : 0));
}

/**
 * Deterministic embedding stub: maps keywords to fixed unit vectors.
 * Fully synchronous so tests don't depend on network/API.
 */
class StubEmbeddingStrategy implements EmbeddingStrategy {
  async embed(text: string): Promise<EmbeddingVector> {
    if (text.includes('auth')) return { values: unitVector(0) };
    if (text.includes('database')) return { values: unitVector(1) };
    if (text.includes('routing')) return { values: unitVector(2) };
    return { values: unitVector(3) };
  }
}

/** Creates a minimal Config stub — no real file I/O needed for unit tests. */
function makeConfig(customExcludes: string[] = []): Config {
  return {
    getWorkspaceContext: () => ({ getDirectories: () => ['/fake/workspace'] }),
    getCustomExcludes: () => customExcludes,
    getFileService: () => ({ filterFiles: (paths: string[]) => paths }),
  } as unknown as Config;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextEngine', () => {
  let engine: ContextEngine;
  let vectorStore: InMemoryVectorStore;
  let embedding: StubEmbeddingStrategy;

  beforeEach(() => {
    embedding = new StubEmbeddingStrategy();
    vectorStore = new InMemoryVectorStore();
    engine = new ContextEngine(makeConfig(), embedding, vectorStore);
  });

  // -------------------------------------------------------------------------
  // retrieveContext
  // -------------------------------------------------------------------------

  describe('retrieveContext', () => {
    it('returns empty array when index is empty', async () => {
      const result = await engine.retrieveContext('anything');
      expect(result).toEqual([]);
    });

    it('returns empty array for blank query', async () => {
      const result = await engine.retrieveContext('   ');
      expect(result).toEqual([]);
    });

    it('retrieves the most semantically similar chunk', async () => {
      // Seed the VectorStore directly (avoids file I/O in tests)
      vectorStore.upsert({
        id: 'auth#0',
        text: 'auth login flow',
        source: '/fake/auth.ts',
        vector: { values: unitVector(0) },
      });
      vectorStore.upsert({
        id: 'db#0',
        text: 'database connection pool',
        source: '/fake/db.ts',
        vector: { values: unitVector(1) },
      });
      vectorStore.upsert({
        id: 'router#0',
        text: 'routing middleware',
        source: '/fake/router.ts',
        vector: { values: unitVector(2) },
      });

      // 'auth' query → StubEmbeddingStrategy returns unitVector(0)
      // → cosine similarity with auth entry = 1.0
      const results = await engine.retrieveContext('auth', 2);
      expect(results).toHaveLength(2);
      expect(results[0].source).toBe('/fake/auth.ts');
      expect(results[0].score).toBeCloseTo(1, 5);
    });

    it('respects topK limit', async () => {
      for (let i = 0; i < 10; i++) {
        vectorStore.upsert({
          id: `file${i}#0`,
          text: `text ${i}`,
          source: `/fake/file${i}.ts`,
          vector: { values: unitVector(3) },
        });
      }
      const results = await engine.retrieveContext('query', 3);
      expect(results).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // formatAsContent
  // -------------------------------------------------------------------------

  describe('formatAsContent', () => {
    const sampleChunks: ContentChunk[] = [
      {
        source: '/fake/auth.ts',
        text: 'export function login() {}',
        score: 0.98,
      },
      {
        source: '/fake/db.ts',
        text: 'export const pool = createPool();',
        score: 0.72,
      },
    ];

    it('produces a user-role Content turn', () => {
      const content = engine.formatAsContent(sampleChunks);
      expect(content.role).toBe('user');
      expect(content.parts).toHaveLength(1);
    });

    it('wraps output in <rag_context> tags', () => {
      const content = engine.formatAsContent(sampleChunks);
      const text = content.parts?.[0]?.text ?? '';
      expect(text).toContain('<rag_context>');
      expect(text).toContain('</rag_context>');
    });

    it('includes source paths and scores for each chunk', () => {
      const content = engine.formatAsContent(sampleChunks);
      const text = content.parts?.[0]?.text ?? '';
      expect(text).toContain('/fake/auth.ts');
      expect(text).toContain('0.980');
      expect(text).toContain('/fake/db.ts');
    });

    it('returns valid content with empty chunk list', () => {
      const content = engine.formatAsContent([]);
      const text = content.parts?.[0]?.text ?? '';
      expect(text).toContain('<rag_context>');
    });
  });
});
