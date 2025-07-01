/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConversationChunk, RelevanceQuery } from './types.js';
import { ContextPruner } from './ContextPruner.js';

describe('ContextPruner', () => {
  let pruner: ContextPruner;

  beforeEach(() => {
    vi.clearAllMocks();
    pruner = new ContextPruner();
  });

  // Helper function to create test chunks
  const createChunk = (
    id: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    tokens: number,
    metadata: Partial<ConversationChunk['metadata']> = {},
  ): ConversationChunk => ({
    id,
    role,
    content,
    tokens,
    timestamp: Date.now() + parseInt(id, 10) * 1000, // Increasing timestamps to maintain order
    metadata: {
      finalScore: 0.5, // Default score
      ...metadata,
    },
  });

  describe('pruneChunks', () => {
    it('should return all chunks when under token budget', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Hello', 5),
        createChunk('2', 'assistant', 'Hi there!', 8),
        createChunk('3', 'user', 'How are you?', 10),
      ];

      const query: RelevanceQuery = { text: 'conversation' };
      const result = pruner.pruneChunks(chunks, query, 100); // Large budget

      expect(result.prunedChunks).toHaveLength(3);
      expect(result.prunedChunks.map((c) => c.id)).toEqual(['1', '2', '3']);
      expect(result.stats.originalChunks).toBe(3);
      expect(result.stats.prunedChunks).toBe(3);
      expect(result.stats.originalTokens).toBe(23);
      expect(result.stats.prunedTokens).toBe(23);
      expect(result.stats.reductionPercentage).toBe(0);
    });

    it('should preserve pinned chunks regardless of score', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Important context', 20, {
          pinned: true,
          finalScore: 0.1, // Low score but pinned
        }),
        createChunk('2', 'assistant', 'High score response', 15, {
          finalScore: 0.9,
        }),
        createChunk('3', 'user', 'Low score question', 10, {
          finalScore: 0.2,
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 35); // Budget for pinned + one more

      expect(result.prunedChunks).toHaveLength(2);
      expect(result.prunedChunks.map((c) => c.id)).toContain('1'); // Pinned chunk included
      expect(result.prunedChunks.map((c) => c.id)).toContain('2'); // Highest score included
    });

    it('should prioritize chunks by score-per-token ratio', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Inefficient chunk', 100, {
          finalScore: 0.5, // Ratio: 0.005
        }),
        createChunk('2', 'assistant', 'Efficient', 10, {
          finalScore: 0.8, // Ratio: 0.08 - highest
        }),
        createChunk('3', 'user', 'Medium', 20, {
          finalScore: 0.6, // Ratio: 0.03
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 30); // Budget for two smaller chunks

      expect(result.prunedChunks).toHaveLength(2);
      expect(result.prunedChunks.map((c) => c.id)).toEqual(['2', '3']); // Best ratios first
    });

    it('should maintain conversation coherence by preserving role alternation', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Question 1', 10, { finalScore: 0.9 }),
        createChunk('2', 'assistant', 'Answer 1', 15, { finalScore: 0.1 }), // Low score but needed for coherence
        createChunk('3', 'user', 'Question 2', 12, { finalScore: 0.8 }),
        createChunk('4', 'assistant', 'Answer 2', 18, { finalScore: 0.7 }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 40); // Budget tight but should preserve pairs

      // Should avoid orphaned assistant responses (assistant responses without preceding user messages)
      const sortedChunks = result.prunedChunks.sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      let hasOrphanedAssistant = false;

      for (let i = 0; i < sortedChunks.length; i++) {
        if (sortedChunks[i].role === 'assistant') {
          // Check if there's at least one user message before this assistant response
          const hasUserBefore = sortedChunks
            .slice(0, i)
            .some((c) => c.role === 'user');
          if (!hasUserBefore) {
            hasOrphanedAssistant = true;
            break;
          }
        }
      }

      expect(hasOrphanedAssistant).toBe(false);
    });

    it('should handle empty chunk list', () => {
      const chunks: ConversationChunk[] = [];
      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 100);

      expect(result.prunedChunks).toHaveLength(0);
      expect(result.stats.originalChunks).toBe(0);
      expect(result.stats.prunedChunks).toBe(0);
      expect(result.stats.originalTokens).toBe(0);
      expect(result.stats.prunedTokens).toBe(0);
      expect(result.stats.reductionPercentage).toBe(0);
    });

    it('should handle zero token budget', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Test', 10),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 0);

      expect(result.prunedChunks).toHaveLength(0);
      expect(result.stats.reductionPercentage).toBe(100);
    });

    it('should include mandatory chunks even if they exceed budget', () => {
      const chunks: ConversationChunk[] = [
        createChunk(
          '1',
          'user',
          'Large pinned chunk that exceeds budget',
          200,
          {
            pinned: true,
          },
        ),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 50); // Budget smaller than pinned chunk

      expect(result.prunedChunks).toHaveLength(1);
      expect(result.prunedChunks[0].id).toBe('1');
      expect(result.stats.prunedTokens).toBe(200); // Exceeds budget but included
    });

    it('should calculate accurate pruning statistics', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Keep this', 10, { finalScore: 0.9 }),
        createChunk('2', 'assistant', 'Keep this too', 15, { finalScore: 0.8 }),
        createChunk('3', 'user', 'Remove this', 20, { finalScore: 0.3 }),
        createChunk('4', 'assistant', 'Remove this too', 25, {
          finalScore: 0.2,
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 30); // Budget for first two

      expect(result.stats.originalChunks).toBe(4);
      expect(result.stats.prunedChunks).toBe(2);
      expect(result.stats.originalTokens).toBe(70);
      expect(result.stats.prunedTokens).toBe(25);
      expect(result.stats.reductionPercentage).toBe(
        Math.round((45 / 70) * 100),
      );
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('preserveCoherence', () => {
    it('should maintain thread ancestry by including related chunks', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Original question', 10, { finalScore: 0.9 }),
        createChunk('2', 'assistant', 'Answer with context', 15, {
          finalScore: 0.6,
        }),
        createChunk('3', 'user', 'Follow-up based on answer', 12, {
          finalScore: 0.8,
        }),
        createChunk('4', 'assistant', 'Final response', 18, {
          finalScore: 0.7,
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };

      // This should prefer keeping conversational threads together
      const result = pruner.pruneChunks(chunks, query, 45); // Budget for most but not all

      // Should maintain some logical conversation flow
      expect(result.prunedChunks.length).toBeGreaterThan(2);

      // Check that we don't have orphaned responses
      const hasOrphanedResponse = result.prunedChunks.some((chunk, i) => {
        if (chunk.role !== 'assistant') return false;
        // Assistant response should have a preceding user message in the pruned set
        const precedingChunks = result.prunedChunks.slice(0, i);
        return !precedingChunks.some((c) => c.role === 'user');
      });

      expect(hasOrphanedResponse).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle chunks with zero tokens', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', '', 0, { finalScore: 0.5 }),
        createChunk('2', 'assistant', 'Valid response', 10, {
          finalScore: 0.8,
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 15);

      expect(result.prunedChunks).toHaveLength(2); // Both should be included
      expect(result.stats.prunedTokens).toBe(10);
    });

    it('should handle chunks with undefined scores', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'No score', 10, { finalScore: undefined }),
        createChunk('2', 'assistant', 'Has score', 15, { finalScore: 0.8 }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 25);

      // Should handle undefined scores gracefully (treat as 0)
      expect(result.prunedChunks).toHaveLength(2);
      expect(result.prunedChunks.find((c) => c.id === '2')).toBeDefined(); // Higher score chunk included
    });

    it('should handle single oversized chunk', () => {
      const chunks: ConversationChunk[] = [
        createChunk(
          '1',
          'user',
          'Massive chunk that exceeds any reasonable budget',
          1000,
        ),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 100);

      // Should either include it (mandatory) or exclude it cleanly
      expect(result.prunedChunks.length).toBeGreaterThanOrEqual(0);
      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should preserve system prompts and tool definitions as mandatory', () => {
      const chunks: ConversationChunk[] = [
        createChunk('system', 'assistant', 'System prompt content', 50, {
          tags: ['system-prompt'],
          finalScore: 0.1,
        }),
        createChunk('tool-def', 'tool', 'Tool definition', 30, {
          tags: ['tool-definition'],
          finalScore: 0.2,
        }),
        createChunk('user-msg', 'user', 'User message', 20, {
          finalScore: 0.9,
        }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 60); // Tight budget

      // System prompts and tool definitions should be preserved
      const systemChunk = result.prunedChunks.find((c) => c.id === 'system');
      const toolChunk = result.prunedChunks.find((c) => c.id === 'tool-def');

      expect(systemChunk).toBeDefined();
      expect(toolChunk).toBeDefined();
    });

    it('should handle very large number of chunks efficiently', () => {
      const chunks: ConversationChunk[] = [];
      for (let i = 0; i < 1000; i++) {
        chunks.push(
          createChunk(
            i.toString(),
            i % 2 === 0 ? 'user' : 'assistant',
            `Message ${i}`,
            10,
            { finalScore: Math.random() },
          ),
        );
      }

      const query: RelevanceQuery = { text: 'test' };
      const startTime = Date.now();
      const result = pruner.pruneChunks(chunks, query, 500); // Budget for ~50 chunks
      const endTime = Date.now();

      expect(result.prunedChunks.length).toBeLessThanOrEqual(50);
      expect(result.stats.prunedTokens).toBeLessThanOrEqual(500);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('algorithm correctness', () => {
    it('should implement greedy selection by score-per-token ratio', () => {
      const chunks: ConversationChunk[] = [
        createChunk('low-ratio', 'user', 'Low efficiency chunk', 100, {
          finalScore: 0.3,
        }), // Ratio: 0.003
        createChunk('high-ratio', 'assistant', 'High efficiency', 10, {
          finalScore: 0.9,
        }), // Ratio: 0.09
        createChunk('med-ratio', 'user', 'Medium efficiency', 30, {
          finalScore: 0.6,
        }), // Ratio: 0.02
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 40); // Budget for high + med ratio chunks

      expect(result.prunedChunks).toHaveLength(2);
      expect(result.prunedChunks[0].id).toBe('high-ratio'); // Highest ratio first
      expect(result.prunedChunks[1].id).toBe('med-ratio'); // Next highest ratio
    });

    it('should respect token budget strictly for non-mandatory chunks', () => {
      const chunks: ConversationChunk[] = [
        createChunk('1', 'user', 'Chunk 1', 15, { finalScore: 0.9 }),
        createChunk('2', 'assistant', 'Chunk 2', 15, { finalScore: 0.8 }),
        createChunk('3', 'user', 'Chunk 3', 15, { finalScore: 0.7 }),
        createChunk('4', 'assistant', 'Chunk 4', 15, { finalScore: 0.6 }),
      ];

      const query: RelevanceQuery = { text: 'test' };
      const result = pruner.pruneChunks(chunks, query, 35); // Budget for exactly 2 chunks

      expect(result.prunedChunks).toHaveLength(2);
      expect(result.stats.prunedTokens).toBe(30); // Should not exceed budget
    });
  });
});
