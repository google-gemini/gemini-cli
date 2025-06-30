/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecencyScorer } from './RecencyScorer.js';
import type { ConversationChunk, RelevanceQuery } from '../types.js';

describe('RecencyScorer', () => {
  let scorer: RecencyScorer;

  beforeEach(() => {
    scorer = new RecencyScorer();
  });

  describe('scoreChunks', () => {
    it('should score more recent chunks higher', () => {
      const now = Date.now();
      const chunks: ConversationChunk[] = [
        {
          id: 'old',
          role: 'user',
          content: 'Old message',
          tokens: 5,
          timestamp: now - 3600000, // 1 hour ago
          metadata: {},
        },
        {
          id: 'recent',
          role: 'assistant',
          content: 'Recent message',
          tokens: 6,
          timestamp: now - 60000, // 1 minute ago
          metadata: {},
        },
        {
          id: 'newest',
          role: 'user',
          content: 'Newest message',
          tokens: 7,
          timestamp: now, // Now
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test query',
        timestamp: now,
      };

      const results = scorer.scoreChunks(chunks, query);

      const oldScore = results.find((r) => r.chunkId === 'old')?.score || 0;
      const recentScore =
        results.find((r) => r.chunkId === 'recent')?.score || 0;
      const newestScore =
        results.find((r) => r.chunkId === 'newest')?.score || 0;

      expect(newestScore).toBeGreaterThan(recentScore);
      expect(recentScore).toBeGreaterThan(oldScore);
    });

    it('should use current time when query timestamp not provided', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp: now - 1000, // 1 second ago
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Response',
          tokens: 6,
          timestamp: now,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = scorer.scoreChunks(chunks, query);

      const score1 = results.find((r) => r.chunkId === '1')?.score || 0;
      const score2 = results.find((r) => r.chunkId === '2')?.score || 0;

      expect(score2).toBeGreaterThan(score1);

      vi.restoreAllMocks();
    });

    it('should return 1.0 for chunks at query timestamp', () => {
      const timestamp = 1000000;
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp,
      };

      const results = scorer.scoreChunks(chunks, query);
      expect(results[0].score).toBe(1.0);
    });

    it('should handle chunks newer than query timestamp', () => {
      const queryTime = 1000000;
      const chunks: ConversationChunk[] = [
        {
          id: 'future',
          role: 'user',
          content: 'Future message',
          tokens: 5,
          timestamp: queryTime + 60000, // 1 minute after query
          metadata: {},
        },
        {
          id: 'past',
          role: 'assistant',
          content: 'Past message',
          tokens: 6,
          timestamp: queryTime - 60000, // 1 minute before query
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp: queryTime,
      };

      const results = scorer.scoreChunks(chunks, query);

      const futureScore =
        results.find((r) => r.chunkId === 'future')?.score || 0;
      const pastScore = results.find((r) => r.chunkId === 'past')?.score || 0;

      // Future chunks should still get some score but less than exact matches
      expect(futureScore).toBeGreaterThan(0);
      expect(futureScore).toBeLessThan(1.0);
      expect(pastScore).toBeGreaterThan(0);
      expect(pastScore).toBeLessThan(1.0);
    });

    it('should use configurable decay rate', () => {
      const customDecayRate = 2.0; // Faster decay
      const customScorer = new RecencyScorer(customDecayRate);

      const queryTime = 1000000;
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp: queryTime - 3600000, // 1 hour ago
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp: queryTime,
      };

      const defaultResults = scorer.scoreChunks(chunks, query);
      const customResults = customScorer.scoreChunks(chunks, query);

      // Custom scorer with faster decay should give lower score for old chunks
      expect(customResults[0].score).toBeLessThan(defaultResults[0].score);
    });

    it('should handle empty chunks array', () => {
      const query: RelevanceQuery = {
        text: 'test',
        timestamp: Date.now(),
      };

      const results = scorer.scoreChunks([], query);
      expect(results).toEqual([]);
    });

    it('should provide recency breakdown in results', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp: Date.now() - 1000,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp: Date.now(),
      };

      const results = scorer.scoreChunks(chunks, query);

      expect(results[0].breakdown.recency).toBeDefined();
      expect(results[0].breakdown.recency).toBe(results[0].score);
    });

    it('should handle very old timestamps gracefully', () => {
      const chunks: ConversationChunk[] = [
        {
          id: 'ancient',
          role: 'user',
          content: 'Very old message',
          tokens: 5,
          timestamp: 0, // Unix epoch
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp: Date.now(),
      };

      const results = scorer.scoreChunks(chunks, query);

      expect(results[0].score).toBeGreaterThanOrEqual(0);
      expect(results[0].score).toBeLessThan(1);
      expect(Number.isFinite(results[0].score)).toBe(true);
    });

    it('should be deterministic for same inputs', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp: 1000000,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'test',
        timestamp: 1000500,
      };

      const results1 = scorer.scoreChunks(chunks, query);
      const results2 = scorer.scoreChunks(chunks, query);

      expect(results1[0].score).toBe(results2[0].score);
    });
  });
});
