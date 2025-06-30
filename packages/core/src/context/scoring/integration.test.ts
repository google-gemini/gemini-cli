/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { HybridScorer } from './HybridScorer.js';
import { EmbeddingScorer } from './EmbeddingScorer.js';
import { BM25Scorer } from './BM25Scorer.js';
import { RecencyScorer } from './RecencyScorer.js';
import type {
  ConversationChunk,
  RelevanceQuery,
  ScoringWeights,
} from '../types.js';

describe('Scoring Integration Tests', () => {
  const sampleChunks: ConversationChunk[] = [
    {
      id: 'chunk1',
      role: 'user',
      content: 'How to implement authentication in JavaScript?',
      tokens: 10,
      timestamp: Date.now() - 3600000, // 1 hour ago
      metadata: {
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        pinned: false,
      },
    },
    {
      id: 'chunk2',
      role: 'assistant',
      content:
        'You can use JWT tokens for secure authentication. Here is an example implementation.',
      tokens: 15,
      timestamp: Date.now() - 1800000, // 30 minutes ago
      metadata: {
        embedding: [0.2, 0.3, 0.4, 0.5, 0.6],
        pinned: true, // This should get manual boost
      },
    },
    {
      id: 'chunk3',
      role: 'user',
      content: 'What about OAuth2 implementation?',
      tokens: 8,
      timestamp: Date.now() - 600000, // 10 minutes ago (most recent)
      metadata: {
        embedding: [0.15, 0.25, 0.35, 0.45, 0.55],
      },
    },
  ];

  const authQuery: RelevanceQuery = {
    text: 'authentication jwt implementation',
    timestamp: Date.now(),
  };

  it('should integrate all scoring algorithms correctly', async () => {
    const weights: ScoringWeights = {
      embedding: 0.4,
      bm25: 0.4,
      recency: 0.15,
      manual: 0.05,
    };

    const hybridScorer = new HybridScorer(weights);
    const results = await hybridScorer.scoreChunks(sampleChunks, authQuery);

    expect(results).toHaveLength(3);

    // All results should have valid scores
    results.forEach((result) => {
      expect(result.chunkId).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.embedding).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.bm25).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.recency).toBeGreaterThanOrEqual(0);
      expect(result.breakdown.manual).toBeGreaterThanOrEqual(0);
    });

    // chunk2 should have manual boost because it's pinned
    const chunk2Result = results.find((r) => r.chunkId === 'chunk2');
    expect(chunk2Result?.breakdown.manual).toBe(1.0);

    // chunk3 should have highest recency score (most recent)
    const chunk3Result = results.find((r) => r.chunkId === 'chunk3');
    const chunk1Result = results.find((r) => r.chunkId === 'chunk1');
    expect(chunk3Result?.breakdown.recency).toBeGreaterThan(
      chunk1Result?.breakdown.recency || 0,
    );
  });

  it('should handle individual scorer components correctly', async () => {
    // Test each scorer individually
    const embeddingScorer = new EmbeddingScorer();
    const bm25Scorer = new BM25Scorer();
    const recencyScorer = new RecencyScorer();

    const embeddingResults = await embeddingScorer.scoreChunks(
      sampleChunks,
      authQuery,
    );
    const bm25Results = bm25Scorer.scoreChunks(sampleChunks, authQuery);
    const recencyResults = recencyScorer.scoreChunks(sampleChunks, authQuery);

    expect(embeddingResults).toHaveLength(3);
    expect(bm25Results).toHaveLength(3);
    expect(recencyResults).toHaveLength(3);

    // All individual scorers should return valid results
    [embeddingResults, bm25Results, recencyResults].forEach((results) => {
      results.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });
  });

  it('should produce different scores with different weights', async () => {
    const weights1: ScoringWeights = {
      embedding: 0.8,
      bm25: 0.1,
      recency: 0.05,
      manual: 0.05,
    };

    const weights2: ScoringWeights = {
      embedding: 0.1,
      bm25: 0.8,
      recency: 0.05,
      manual: 0.05,
    };

    const scorer1 = new HybridScorer(weights1);
    const scorer2 = new HybridScorer(weights2);

    const results1 = await scorer1.scoreChunks(sampleChunks, authQuery);
    const results2 = await scorer2.scoreChunks(sampleChunks, authQuery);

    // Results should be different due to different weights
    const score1_chunk1 =
      results1.find((r) => r.chunkId === 'chunk1')?.score || 0;
    const score2_chunk1 =
      results2.find((r) => r.chunkId === 'chunk1')?.score || 0;

    // With different weights, scores should generally be different
    // (unless all component scores happen to be identical, which is unlikely)
    expect(Math.abs(score1_chunk1 - score2_chunk1)).toBeGreaterThan(0.001);
  });

  it('should maintain score consistency across multiple runs', async () => {
    const hybridScorer = new HybridScorer();

    const results1 = await hybridScorer.scoreChunks(sampleChunks, authQuery);
    const results2 = await hybridScorer.scoreChunks(sampleChunks, authQuery);

    // Results should be identical across runs
    expect(results1).toEqual(results2);
  });
});
