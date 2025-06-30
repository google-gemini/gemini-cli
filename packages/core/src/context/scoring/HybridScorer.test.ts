/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridScorer } from './HybridScorer.js';
import type {
  ConversationChunk,
  RelevanceQuery,
  ScoringWeights,
  ScoringResult,
} from '../types.js';

// Create mock functions that will be used by the scorers
const mockBM25ScoreChunks = vi.fn();
const mockEmbeddingScoreChunks = vi.fn();
const mockRecencyScoreChunks = vi.fn();

// Mock the dependency scorers
vi.mock('./BM25Scorer.js', () => ({
  BM25Scorer: vi.fn().mockImplementation(() => ({
    scoreChunks: mockBM25ScoreChunks,
  })),
}));

vi.mock('./EmbeddingScorer.js', () => ({
  EmbeddingScorer: vi.fn().mockImplementation(() => ({
    scoreChunks: mockEmbeddingScoreChunks,
  })),
}));

vi.mock('./RecencyScorer.js', () => ({
  RecencyScorer: vi.fn().mockImplementation(() => ({
    scoreChunks: mockRecencyScoreChunks,
  })),
}));

describe('HybridScorer', () => {
  let hybridScorer: HybridScorer;

  const defaultWeights: ScoringWeights = {
    embedding: 0.4,
    bm25: 0.4,
    recency: 0.15,
    manual: 0.05,
  };

  const sampleChunks: ConversationChunk[] = [
    {
      id: 'chunk1',
      role: 'user',
      content: 'How to implement authentication?',
      tokens: 10,
      timestamp: 1000,
      metadata: {},
    },
    {
      id: 'chunk2',
      role: 'assistant',
      content: 'You can use JWT tokens for authentication.',
      tokens: 12,
      timestamp: 2000,
      metadata: {
        pinned: true,
      },
    },
    {
      id: 'chunk3',
      role: 'user',
      content: 'What about database connections?',
      tokens: 8,
      timestamp: 3000,
      metadata: {},
    },
  ];

  const sampleQuery: RelevanceQuery = {
    text: 'authentication implementation',
    timestamp: 4000,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset all mock functions
    mockBM25ScoreChunks.mockReset();
    mockEmbeddingScoreChunks.mockReset();
    mockRecencyScoreChunks.mockReset();

    hybridScorer = new HybridScorer(defaultWeights);
  });

  describe('constructor', () => {
    it('should create instance with default weights when none provided', () => {
      const scorer = new HybridScorer();
      expect(scorer).toBeDefined();
    });

    it('should create instance with custom weights', () => {
      const customWeights: ScoringWeights = {
        embedding: 0.5,
        bm25: 0.3,
        recency: 0.1,
        manual: 0.1,
      };

      const scorer = new HybridScorer(customWeights);
      expect(scorer).toBeDefined();
    });

    it('should validate weights sum to reasonable range', () => {
      // Should not throw for weights that sum close to 1.0
      expect(() => new HybridScorer(defaultWeights)).not.toThrow();
    });
  });

  describe('scoreChunks', () => {
    it('should combine scores from all algorithms with proper weights', async () => {
      // Setup mock return values
      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.8, breakdown: { bm25: 0.8 } },
        { chunkId: 'chunk2', score: 0.6, breakdown: { bm25: 0.6 } },
        { chunkId: 'chunk3', score: 0.2, breakdown: { bm25: 0.2 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.7, breakdown: { embedding: 0.7 } },
        { chunkId: 'chunk2', score: 0.5, breakdown: { embedding: 0.5 } },
        { chunkId: 'chunk3', score: 0.9, breakdown: { embedding: 0.9 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { recency: 0.3 } },
        { chunkId: 'chunk2', score: 0.8, breakdown: { recency: 0.8 } },
        { chunkId: 'chunk3', score: 0.95, breakdown: { recency: 0.95 } },
      ]);

      const results = await hybridScorer.scoreChunks(sampleChunks, sampleQuery);

      expect(results).toHaveLength(3);

      // Check that each result has the expected structure
      results.forEach((result) => {
        expect(result.chunkId).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.breakdown).toBeDefined();
        expect(result.breakdown.embedding).toBeDefined();
        expect(result.breakdown.bm25).toBeDefined();
        expect(result.breakdown.recency).toBeDefined();
      });

      // Verify the hybrid score calculation for first chunk
      // Expected: 0.4 * 0.7 + 0.4 * 0.8 + 0.15 * 0.3 + 0.05 * 0 = 0.645
      const chunk1Result = results.find((r) => r.chunkId === 'chunk1');
      expect(chunk1Result?.score).toBeCloseTo(0.645, 3);
    });

    it('should handle manual boost scores from pinned chunks', async () => {
      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { bm25: 0.5 } },
        { chunkId: 'chunk2', score: 0.5, breakdown: { bm25: 0.5 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { embedding: 0.5 } },
        { chunkId: 'chunk2', score: 0.5, breakdown: { embedding: 0.5 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { recency: 0.5 } },
        { chunkId: 'chunk2', score: 0.5, breakdown: { recency: 0.5 } },
      ]);

      const chunksWithPinned = [sampleChunks[0], sampleChunks[1]]; // chunk2 is pinned

      const results = await hybridScorer.scoreChunks(
        chunksWithPinned,
        sampleQuery,
      );

      const pinnedResult = results.find((r) => r.chunkId === 'chunk2');
      const unpinnedResult = results.find((r) => r.chunkId === 'chunk1');

      // Pinned chunk should have higher score due to manual boost
      expect(pinnedResult?.score).toBeGreaterThan(unpinnedResult?.score || 0);
      expect(pinnedResult?.breakdown.manual).toBe(1.0);
      expect(unpinnedResult?.breakdown.manual).toBe(0);
    });

    it('should handle missing scores gracefully with fallback to 0', async () => {
      // BM25 returns no results (empty array)
      mockBM25ScoreChunks.mockReturnValue([]);

      // Embedding scorer fails/returns partial results
      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.7, breakdown: { embedding: 0.7 } },
        // chunk2 and chunk3 missing
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { recency: 0.3 } },
        { chunkId: 'chunk2', score: 0.8, breakdown: { recency: 0.8 } },
        { chunkId: 'chunk3', score: 0.95, breakdown: { recency: 0.95 } },
      ]);

      const results = await hybridScorer.scoreChunks(sampleChunks, sampleQuery);

      expect(results).toHaveLength(3);

      // chunk1: has embedding (0.7) and recency (0.3), missing BM25 (0)
      // Expected: 0.4 * 0.7 + 0.4 * 0 + 0.15 * 0.3 + 0.05 * 0 = 0.325
      const chunk1Result = results.find((r) => r.chunkId === 'chunk1');
      expect(chunk1Result?.score).toBeCloseTo(0.325, 3);
      expect(chunk1Result?.breakdown.bm25).toBe(0);
    });

    it('should handle empty chunks array', async () => {
      const results = await hybridScorer.scoreChunks([], sampleQuery);
      expect(results).toEqual([]);
    });

    it('should handle chunks with missing metadata gracefully', async () => {
      const chunksWithoutMetadata: ConversationChunk[] = [
        {
          id: 'chunk1',
          role: 'user',
          content: 'Test content',
          tokens: 5,
          timestamp: 1000,
          metadata: {}, // Empty metadata
        },
      ];

      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { bm25: 0.5 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { embedding: 0.3 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.8, breakdown: { recency: 0.8 } },
      ]);

      const results = await hybridScorer.scoreChunks(
        chunksWithoutMetadata,
        sampleQuery,
      );

      expect(results).toHaveLength(1);
      expect(results[0].breakdown.manual).toBe(0); // No pinned flag
    });

    it('should normalize final scores to 0-1 range', async () => {
      // Setup high scores that might exceed 1.0
      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 1.0, breakdown: { bm25: 1.0 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 1.0, breakdown: { embedding: 1.0 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 1.0, breakdown: { recency: 1.0 } },
      ]);

      const pinnedChunk: ConversationChunk[] = [
        {
          ...sampleChunks[0],
          metadata: { pinned: true },
        },
      ];

      const results = await hybridScorer.scoreChunks(pinnedChunk, sampleQuery);

      expect(results[0].score).toBeLessThanOrEqual(1.0);
      expect(results[0].score).toBeGreaterThanOrEqual(0);
    });

    it('should provide detailed breakdown for debugging', async () => {
      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.6, breakdown: { bm25: 0.6 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.8, breakdown: { embedding: 0.8 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.4, breakdown: { recency: 0.4 } },
      ]);

      const results = await hybridScorer.scoreChunks(
        [sampleChunks[0]],
        sampleQuery,
      );

      const breakdown = results[0].breakdown;
      expect(breakdown.embedding).toBe(0.8);
      expect(breakdown.bm25).toBe(0.6);
      expect(breakdown.recency).toBe(0.4);
      expect(breakdown.manual).toBe(0);
    });

    it('should call all scorer dependencies with correct parameters', async () => {
      mockBM25ScoreChunks.mockReturnValue([]);
      mockEmbeddingScoreChunks.mockResolvedValue([]);
      mockRecencyScoreChunks.mockReturnValue([]);

      await hybridScorer.scoreChunks(sampleChunks, sampleQuery);

      expect(mockBM25ScoreChunks).toHaveBeenCalledWith(
        sampleChunks,
        sampleQuery,
      );
      expect(mockEmbeddingScoreChunks).toHaveBeenCalledWith(
        sampleChunks,
        sampleQuery,
      );
      expect(mockRecencyScoreChunks).toHaveBeenCalledWith(
        sampleChunks,
        sampleQuery,
      );
    });

    it('should handle scorer errors gracefully', async () => {
      // BM25 scorer throws error
      mockBM25ScoreChunks.mockImplementation(() => {
        throw new Error('BM25 scorer failed');
      });

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.7, breakdown: { embedding: 0.7 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { recency: 0.3 } },
      ]);

      // Should not throw, but handle gracefully
      const results = await hybridScorer.scoreChunks(
        [sampleChunks[0]],
        sampleQuery,
      );

      expect(results).toHaveLength(1);
      expect(results[0].breakdown.bm25).toBe(0); // Falls back to 0
    });
  });

  describe('score combination edge cases', () => {
    it('should handle zero weights correctly', async () => {
      const zeroWeights: ScoringWeights = {
        embedding: 0,
        bm25: 1.0,
        recency: 0,
        manual: 0,
      };

      const scorer = new HybridScorer(zeroWeights);

      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.8, breakdown: { bm25: 0.8 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { embedding: 0.5 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { recency: 0.3 } },
      ]);

      const results = await scorer.scoreChunks([sampleChunks[0]], sampleQuery);

      // Should only use BM25 score (weight = 1.0)
      expect(results[0].score).toBeCloseTo(0.8, 3);
    });

    it('should handle negative scores by clamping to 0', async () => {
      // This might happen with some scoring algorithms
      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: -0.1, breakdown: { bm25: -0.1 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { embedding: 0.5 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.3, breakdown: { recency: 0.3 } },
      ]);

      const results = await hybridScorer.scoreChunks(
        [sampleChunks[0]],
        sampleQuery,
      );

      expect(results[0].score).toBeGreaterThanOrEqual(0);
    });

    it('should maintain consistent ordering with same inputs', async () => {
      const mockScores = [
        { chunkId: 'chunk1', score: 0.8, breakdown: { bm25: 0.8 } },
        { chunkId: 'chunk2', score: 0.6, breakdown: { bm25: 0.6 } },
        { chunkId: 'chunk3', score: 0.4, breakdown: { bm25: 0.4 } },
      ];

      mockBM25ScoreChunks.mockReturnValue(mockScores);
      mockEmbeddingScoreChunks.mockResolvedValue(mockScores);
      mockRecencyScoreChunks.mockReturnValue(mockScores);

      const results1 = await hybridScorer.scoreChunks(
        sampleChunks,
        sampleQuery,
      );
      const results2 = await hybridScorer.scoreChunks(
        sampleChunks,
        sampleQuery,
      );

      expect(results1).toEqual(results2);
    });
  });

  describe('updateWeights', () => {
    it('should allow runtime weight updates', async () => {
      const newWeights: ScoringWeights = {
        embedding: 0.8,
        bm25: 0.1,
        recency: 0.05,
        manual: 0.05,
      };

      hybridScorer.updateWeights(newWeights);

      mockBM25ScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.5, breakdown: { bm25: 0.5 } },
      ]);

      mockEmbeddingScoreChunks.mockResolvedValue([
        { chunkId: 'chunk1', score: 0.9, breakdown: { embedding: 0.9 } },
      ]);

      mockRecencyScoreChunks.mockReturnValue([
        { chunkId: 'chunk1', score: 0.2, breakdown: { recency: 0.2 } },
      ]);

      const results = await hybridScorer.scoreChunks(
        [sampleChunks[0]],
        sampleQuery,
      );

      // With high embedding weight (0.8), score should be dominated by embedding score
      // Expected: 0.8 * 0.9 + 0.1 * 0.5 + 0.05 * 0.2 + 0.05 * 0 = 0.78
      expect(results[0].score).toBeCloseTo(0.78, 2);
    });
  });
});
