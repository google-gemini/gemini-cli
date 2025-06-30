/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingScorer } from './EmbeddingScorer.js';
import type { ConversationChunk, RelevanceQuery } from '../types.js';

describe('EmbeddingScorer', () => {
  let embeddingScorer: EmbeddingScorer;

  // Mock embedding vectors for testing
  const mockQueryEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
  const mockChunkEmbedding1 = [0.1, 0.2, 0.3, 0.4, 0.5]; // Identical to query (cosine similarity = 1.0)
  const mockChunkEmbedding2 = [0.5, 0.4, 0.3, 0.2, 0.1]; // Reverse of query (cosine similarity ≈ 0.55)
  const mockChunkEmbedding3 = [-0.1, -0.2, -0.3, -0.4, -0.5]; // Opposite of query (cosine similarity = -1.0)
  const mockChunkEmbedding4 = [0.0, 0.0, 0.0, 0.0, 0.0]; // Zero vector
  const mockChunkEmbedding5 = [0.2, -0.1, 0.0, 0.0, 0.0]; // Orthogonal to query (dot product ≈ 0)

  const sampleChunks: ConversationChunk[] = [
    {
      id: 'chunk1',
      role: 'user',
      content: 'How to implement authentication?',
      tokens: 10,
      timestamp: 1000,
      metadata: {
        embedding: mockChunkEmbedding1,
      },
    },
    {
      id: 'chunk2',
      role: 'assistant',
      content: 'You can use JWT tokens for authentication.',
      tokens: 12,
      timestamp: 2000,
      metadata: {
        embedding: mockChunkEmbedding2,
      },
    },
    {
      id: 'chunk3',
      role: 'user',
      content: 'What about database connections?',
      tokens: 8,
      timestamp: 3000,
      metadata: {
        embedding: mockChunkEmbedding3,
      },
    },
    {
      id: 'chunk4',
      role: 'assistant',
      content: 'Empty embedding test',
      tokens: 5,
      timestamp: 4000,
      metadata: {
        embedding: mockChunkEmbedding4,
      },
    },
    {
      id: 'chunk5',
      role: 'user',
      content: 'Low similarity embedding test',
      tokens: 6,
      timestamp: 5000,
      metadata: {
        embedding: mockChunkEmbedding5,
      },
    },
    {
      id: 'chunk6',
      role: 'assistant',
      content: 'No embedding available',
      tokens: 7,
      timestamp: 6000,
      metadata: {}, // No embedding
    },
  ];

  beforeEach(() => {
    // Mock the generateEmbedding function for testing
    const mockGenerateEmbedding = vi.fn().mockResolvedValue(mockQueryEmbedding);
    embeddingScorer = new EmbeddingScorer(mockGenerateEmbedding);
  });

  describe('constructor', () => {
    it('should create instance with embedding generator function', () => {
      const mockGenerator = vi.fn();
      const scorer = new EmbeddingScorer(mockGenerator);
      expect(scorer).toBeDefined();
    });

    it('should create instance without embedding generator for pre-computed embeddings only', () => {
      const scorer = new EmbeddingScorer();
      expect(scorer).toBeDefined();
    });
  });

  describe('scoreChunks', () => {
    it('should calculate cosine similarity for chunks with embeddings', async () => {
      const query: RelevanceQuery = {
        text: 'authentication implementation',
      };

      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      expect(results).toHaveLength(6);

      // chunk1: identical embedding should have similarity = 1.0
      const chunk1Result = results.find(r => r.chunkId === 'chunk1');
      expect(chunk1Result?.score).toBeCloseTo(1.0, 3);
      expect(chunk1Result?.breakdown.embedding).toBeCloseTo(1.0, 3);

      // chunk2: reverse embedding should have positive similarity but less than 1.0
      const chunk2Result = results.find(r => r.chunkId === 'chunk2');
      expect(chunk2Result?.score).toBeGreaterThan(0);
      expect(chunk2Result?.score).toBeLessThan(1.0);

      // chunk3: opposite embedding should have similarity close to -1.0, but normalized to 0
      const chunk3Result = results.find(r => r.chunkId === 'chunk3');
      expect(chunk3Result?.score).toBe(0); // Negative similarities clamped to 0

      // chunk5: orthogonal embedding should have similarity close to 0
      const chunk5Result = results.find(r => r.chunkId === 'chunk5');
      expect(chunk5Result?.score).toBeLessThan(0.1); // Should be close to 0
    });

    it('should handle chunks without embeddings gracefully', async () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      // chunk6 has no embedding
      const chunk6Result = results.find(r => r.chunkId === 'chunk6');
      expect(chunk6Result?.score).toBe(0);
      expect(chunk6Result?.breakdown.embedding).toBe(0);
    });

    it('should handle zero embeddings without throwing errors', async () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      // chunk4 has zero embedding
      const chunk4Result = results.find(r => r.chunkId === 'chunk4');
      expect(chunk4Result?.score).toBe(0); // Zero vector similarity handled gracefully
      expect(chunk4Result?.breakdown.embedding).toBe(0);
    });

    it('should handle empty chunks array', async () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await embeddingScorer.scoreChunks([], query);
      expect(results).toEqual([]);
    });

    it('should handle empty query text', async () => {
      const query: RelevanceQuery = {
        text: '',
      };

      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      // Should still return results with zero scores when query is empty
      expect(results).toHaveLength(6);
      results.forEach(result => {
        expect(result.score).toBe(0);
      });
    });

    it('should work with pre-computed query embeddings', async () => {
      const query: RelevanceQuery = {
        text: 'authentication implementation',
        // In a real scenario, this might be provided to avoid recomputation
      };

      // Test with pre-computed embeddings in chunks
      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      // All chunks should get valid scores based on their pre-computed embeddings
      const validResults = results.filter(r => r.score > 0);
      expect(validResults.length).toBeGreaterThan(0);
    });

    it('should normalize scores to 0-1 range', async () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await embeddingScorer.scoreChunks(sampleChunks, query);

      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should handle mismatched embedding dimensions gracefully', async () => {
      const chunksWithMismatchedEmbeddings: ConversationChunk[] = [
        {
          id: 'chunk1',
          role: 'user',
          content: 'Test content',
          tokens: 5,
          timestamp: 1000,
          metadata: {
            embedding: [0.1, 0.2], // 2D embedding
          },
        },
        {
          id: 'chunk2',
          role: 'assistant',
          content: 'Another test',
          tokens: 6,
          timestamp: 2000,
          metadata: {
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], // 6D embedding
          },
        },
      ];

      const query: RelevanceQuery = {
        text: 'test query',
      };

      // Should handle dimension mismatches without throwing
      const results = await embeddingScorer.scoreChunks(chunksWithMismatchedEmbeddings, query);

      expect(results).toHaveLength(2);
      // Mismatched dimensions should result in 0 scores
      results.forEach(result => {
        expect(result.score).toBe(0);
      });
    });

    it('should handle embedding generation failures gracefully', async () => {
      const mockFailingGenerator = vi.fn().mockRejectedValue(new Error('Embedding API failed'));
      const failingScorer = new EmbeddingScorer(mockFailingGenerator);

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await failingScorer.scoreChunks(sampleChunks, query);

      // Should return zero scores when embedding generation fails
      expect(results).toHaveLength(6);
      results.forEach(result => {
        expect(result.score).toBe(0);
        expect(result.breakdown.embedding).toBe(0);
      });
    });

    it('should work without embedding generator when all chunks have pre-computed embeddings', async () => {
      const scorerWithoutGenerator = new EmbeddingScorer(); // No generator function

      const query: RelevanceQuery = {
        text: 'test query',
        // Could include pre-computed embedding here in real usage
      };

      // Should work with pre-computed embeddings only
      const results = await scorerWithoutGenerator.scoreChunks(sampleChunks.slice(0, 5), query);

      expect(results).toHaveLength(5);
      // Without query embedding, should return zero scores
      results.forEach(result => {
        expect(result.score).toBe(0);
      });
    });
  });

  describe('cosine similarity calculation', () => {
    it('should calculate correct cosine similarity for known vectors', async () => {
      const testChunks: ConversationChunk[] = [
        {
          id: 'identical',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [1, 0, 0],
          },
        },
        {
          id: 'orthogonal',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [0, 1, 0],
          },
        },
        {
          id: 'opposite',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [-1, 0, 0],
          },
        },
      ];

      // Mock query embedding as [1, 0, 0]
      const mockGenerator = vi.fn().mockResolvedValue([1, 0, 0]);
      const scorer = new EmbeddingScorer(mockGenerator);

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await scorer.scoreChunks(testChunks, query);

      // Identical vectors: cosine similarity = 1.0
      const identicalResult = results.find(r => r.chunkId === 'identical');
      expect(identicalResult?.score).toBeCloseTo(1.0, 3);

      // Orthogonal vectors: cosine similarity = 0.0
      const orthogonalResult = results.find(r => r.chunkId === 'orthogonal');
      expect(orthogonalResult?.score).toBeCloseTo(0.0, 3);

      // Opposite vectors: cosine similarity = -1.0, but clamped to 0
      const oppositeResult = results.find(r => r.chunkId === 'opposite');
      expect(oppositeResult?.score).toBe(0);
    });

    it('should handle unit vector normalization correctly', async () => {
      const testChunks: ConversationChunk[] = [
        {
          id: 'unnormalized',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [3, 4, 0], // Magnitude = 5
          },
        },
      ];

      // Mock query embedding as [3, 4, 0] (same direction, magnitude = 5)
      const mockGenerator = vi.fn().mockResolvedValue([3, 4, 0]);
      const scorer = new EmbeddingScorer(mockGenerator);

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await scorer.scoreChunks(testChunks, query);

      // Same direction vectors should have similarity = 1.0 regardless of magnitude
      expect(results[0].score).toBeCloseTo(1.0, 3);
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large embedding dimensions efficiently', async () => {
      const largeEmbedding = new Array(1024).fill(0).map((_, i) => Math.sin(i * 0.1));
      
      const testChunks: ConversationChunk[] = [
        {
          id: 'large',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: largeEmbedding,
          },
        },
      ];

      const mockGenerator = vi.fn().mockResolvedValue(largeEmbedding);
      const scorer = new EmbeddingScorer(mockGenerator);

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const startTime = performance.now();
      const results = await scorer.scoreChunks(testChunks, query);
      const endTime = performance.now();

      expect(results).toHaveLength(1);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    it('should handle NaN and Infinity values in embeddings', async () => {
      const testChunks: ConversationChunk[] = [
        {
          id: 'nan',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [NaN, 1, 2],
          },
        },
        {
          id: 'infinity',
          role: 'user',
          content: 'test',
          tokens: 1,
          timestamp: 1000,
          metadata: {
            embedding: [Infinity, 1, 2],
          },
        },
      ];

      const mockGenerator = vi.fn().mockResolvedValue([1, 1, 1]);
      const scorer = new EmbeddingScorer(mockGenerator);

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = await scorer.scoreChunks(testChunks, query);

      // Should handle invalid values gracefully
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(result.score)).toBe(true);
      });
    });

    it('should be deterministic with same inputs', async () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results1 = await embeddingScorer.scoreChunks(sampleChunks, query);
      const results2 = await embeddingScorer.scoreChunks(sampleChunks, query);

      expect(results1).toEqual(results2);
    });
  });
});