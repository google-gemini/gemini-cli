/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Scorer } from './BM25Scorer.js';
import type { ConversationChunk, RelevanceQuery } from '../types.js';

describe('BM25Scorer', () => {
  let scorer: BM25Scorer;

  beforeEach(() => {
    scorer = new BM25Scorer();
  });

  describe('scoreChunks', () => {
    it('should return scores for all chunks', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'How to implement authentication in Node.js',
          tokens: 10,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'To implement authentication, use passport.js library',
          tokens: 12,
          timestamp: 2,
          metadata: {},
        },
        {
          id: '3',
          role: 'user',
          content: 'Can you show me database connection code?',
          tokens: 9,
          timestamp: 3,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'authentication implementation',
      };

      const results = scorer.scoreChunks(chunks, query);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.chunkId).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.breakdown.bm25).toBeDefined();
      });
    });

    it('should score relevant chunks higher', () => {
      const chunks: ConversationChunk[] = [
        {
          id: 'relevant',
          role: 'assistant',
          content:
            'Authentication is important for security. Use JWT tokens for authentication.',
          tokens: 15,
          timestamp: 1,
          metadata: {},
        },
        {
          id: 'irrelevant',
          role: 'user',
          content: 'The weather is nice today. I like cats.',
          tokens: 10,
          timestamp: 2,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'authentication security',
      };

      const results = scorer.scoreChunks(chunks, query);
      const relevantResult = results.find((r) => r.chunkId === 'relevant');
      const irrelevantResult = results.find((r) => r.chunkId === 'irrelevant');

      expect(relevantResult?.score).toBeGreaterThan(
        irrelevantResult?.score || 0,
      );
    });

    it('should handle empty query gracefully', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Some content',
          tokens: 5,
          timestamp: 1,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: '',
      };

      const results = scorer.scoreChunks(chunks, query);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0);
    });

    it('should handle empty chunks array', () => {
      const query: RelevanceQuery = {
        text: 'test query',
      };

      const results = scorer.scoreChunks([], query);
      expect(results).toEqual([]);
    });

    it('should normalize scores between 0 and 1', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'authentication security login user password',
          tokens: 10,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'database connection setup configuration',
          tokens: 8,
          timestamp: 2,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'authentication security',
      };

      const results = scorer.scoreChunks(chunks, query);
      results.forEach((result) => {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      });
    });

    it('should handle special characters and punctuation', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content:
            'How to use Node.js? Can you help with Express.js implementation!',
          tokens: 15,
          timestamp: 1,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'Node.js Express.js',
      };

      const results = scorer.scoreChunks(chunks, query);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'AUTHENTICATION is IMPORTANT',
          tokens: 5,
          timestamp: 1,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'authentication important',
      };

      const results = scorer.scoreChunks(chunks, query);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('should handle repeated words correctly', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'test test test authentication test',
          tokens: 8,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'authentication is important for security',
          tokens: 10,
          timestamp: 2,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'authentication',
      };

      const results = scorer.scoreChunks(chunks, query);
      const result1 = results.find((r) => r.chunkId === '1');
      const result2 = results.find((r) => r.chunkId === '2');

      // Both should have positive scores
      expect(result1?.score).toBeGreaterThan(0);
      expect(result2?.score).toBeGreaterThan(0);
    });
  });

  describe('updateIndex', () => {
    it('should rebuild index when chunks change', () => {
      const initialChunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'original content',
          tokens: 5,
          timestamp: 1,
          metadata: {},
        },
      ];

      const query: RelevanceQuery = {
        text: 'updated specific',
      };

      // Score with initial chunks
      let results = scorer.scoreChunks(initialChunks, query);
      expect(results[0].score).toBe(0); // No match

      // Update with new chunks
      const updatedChunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'updated specific content here',
          tokens: 8,
          timestamp: 1,
          metadata: {},
        },
      ];

      results = scorer.scoreChunks(updatedChunks, query);
      expect(results[0].score).toBeGreaterThan(0); // Should match now
    });
  });
});
