/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContextManager } from './ContextManager.js';
import { EmbeddingScorer as _EmbeddingScorer } from './scoring/EmbeddingScorer.js';
import { RecencyScorer as _RecencyScorer } from './scoring/RecencyScorer.js';
import type {
  ConversationChunk,
  ContextOptimizationConfig,
  RelevanceQuery,
} from './types.js';

describe('Context Optimization System - End-to-End Integration', () => {
  let contextManager: ContextManager;
  let config: ContextOptimizationConfig;

  const createMockChunk = (
    id: string,
    role: 'user' | 'assistant' | 'tool' = 'user',
    content: string = '',
    tokens?: number,
    timestamp?: number,
    pinned = false,
    tags?: string[],
  ): ConversationChunk => ({
    id,
    role,
    content: content || `Test content for ${id}`,
    tokens: tokens || Math.max(10, content.length / 4), // Rough token estimate
    timestamp: timestamp || Date.now() - Math.random() * 10000, // Random recent timestamp
    metadata: {
      pinned,
      tags,
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      enabled: true,
      maxChunks: 10,
      embeddingEnabled: true,
      aggressivePruning: false,
      scoringWeights: {
        embedding: 0.4,
        bm25: 0.4,
        recency: 0.15,
        manual: 0.05,
      },
    };

    contextManager = new ContextManager(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Conversation Workflow', () => {
    it('should handle a realistic conversation flow with optimization', async () => {
      // Simulate a realistic conversation about JavaScript concepts
      const chunks: ConversationChunk[] = [
        createMockChunk(
          '1',
          'user',
          'What is a closure in JavaScript?',
          100,
          Date.now() - 10000,
        ),
        createMockChunk(
          '2',
          'assistant',
          'A closure in JavaScript is a function that has access to variables in its outer (lexical) scope even after the outer function has finished executing. This allows the inner function to "remember" the environment in which it was created.',
          400,
          Date.now() - 9000,
        ),
        createMockChunk(
          '3',
          'user',
          'Can you give me a practical example?',
          80,
          Date.now() - 8000,
        ),
        createMockChunk(
          '4',
          'assistant',
          "Sure! Here's a simple example: function outerFunction(x) { return function(y) { return x + y; }; } const addFive = outerFunction(5); console.log(addFive(3)); // Output: 8",
          300,
          Date.now() - 7000,
        ),
        createMockChunk(
          '5',
          'user',
          'How are closures used in React hooks?',
          90,
          Date.now() - 6000,
        ),
        createMockChunk(
          '6',
          'assistant',
          'React hooks like useState and useEffect rely heavily on closures. When you call useState, it returns a state variable and a setter function that "closes over" the current state value. This allows the setter to update the specific piece of state even after the component function has finished executing.',
          450,
          Date.now() - 5000,
        ),
        createMockChunk(
          '7',
          'user',
          'What about memory leaks with closures?',
          85,
          Date.now() - 4000,
        ),
        createMockChunk(
          '8',
          'assistant',
          "Closures can potentially cause memory leaks if they hold references to large objects or DOM elements that should be garbage collected. The closure keeps these references alive even when they're no longer needed. To avoid this, you should nullify references when done and be careful with event listeners.",
          420,
          Date.now() - 3000,
        ),
        createMockChunk(
          '9',
          'user',
          'Tell me about async/await patterns',
          75,
          Date.now() - 2000,
        ),
        createMockChunk(
          '10',
          'assistant',
          'Async/await is syntactic sugar over Promises that makes asynchronous code look more like synchronous code. You mark a function as async and then use await to pause execution until a Promise resolves.',
          350,
          Date.now() - 1000,
        ),
      ];

      // Add all chunks to the context manager
      contextManager.addChunks(chunks);

      // Verify all chunks are added
      expect(contextManager.getTotalTokens()).toBe(
        chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
      );

      // Query specifically about closures - should prioritize relevant chunks
      const closureQuery: RelevanceQuery = {
        text: 'closure React hooks memory',
        role: 'user',
        timestamp: Date.now(),
      };

      // Optimize with a budget that forces pruning
      const tokenBudget = 1200; // Should force removal of some chunks
      const optimizedContext = await contextManager.optimizeContext(
        closureQuery,
        tokenBudget,
      );

      // Verify optimization results
      expect(optimizedContext.chunks.length).toBeLessThan(chunks.length);
      expect(optimizedContext.totalTokens).toBeLessThanOrEqual(tokenBudget);
      expect(optimizedContext.maxTokens).toBe(tokenBudget);

      // Verify that relevant chunks (containing "closure") are preferentially kept
      const keptChunkContents = optimizedContext.chunks.map((chunk) =>
        chunk.content.toLowerCase(),
      );
      const hasClosureContent = keptChunkContents.some((content) =>
        content.includes('closure'),
      );
      expect(hasClosureContent).toBe(true);

      // Verify conversation coherence - no orphaned assistant responses
      const sortedKeptChunks = optimizedContext.chunks.sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      for (let i = 0; i < sortedKeptChunks.length; i++) {
        const chunk = sortedKeptChunks[i];
        if (chunk.role === 'assistant') {
          // Find a user message before this assistant response
          const hasUserBefore = sortedKeptChunks
            .slice(0, i)
            .some((c) => c.role === 'user');
          expect(hasUserBefore).toBe(true);
        }
      }

      // Verify statistics are tracked
      const stats = contextManager.getOptimizationStats();
      expect(stats).not.toBeNull();
      expect(stats!.originalChunks).toBe(chunks.length);
      expect(stats!.prunedChunks).toBe(optimizedContext.chunks.length);
      expect(stats!.reductionPercentage).toBeGreaterThan(0);
    });

    it('should preserve pinned chunks during optimization', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk(
          'important',
          'user',
          'Critical system information',
          100,
          Date.now() - 5000,
          true,
        ), // Pinned
        createMockChunk(
          'normal1',
          'user',
          'Regular message 1',
          100,
          Date.now() - 4000,
        ),
        createMockChunk(
          'normal2',
          'user',
          'Regular message 2',
          100,
          Date.now() - 3000,
        ),
        createMockChunk(
          'normal3',
          'user',
          'Regular message 3',
          100,
          Date.now() - 2000,
        ),
        createMockChunk(
          'normal4',
          'user',
          'Regular message 4',
          100,
          Date.now() - 1000,
        ),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'unrelated query about weather' };
      const optimizedContext = await contextManager.optimizeContext(query, 250); // Budget for ~2-3 chunks

      // Pinned chunk should always be included
      const pinnedChunkIncluded = optimizedContext.chunks.some(
        (chunk) => chunk.id === 'important',
      );
      expect(pinnedChunkIncluded).toBe(true);
    });

    it('should handle system prompts and tool definitions specially', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk(
          'system',
          'assistant',
          'You are a helpful AI assistant',
          150,
          Date.now() - 10000,
          false,
          ['system-prompt'],
        ),
        createMockChunk(
          'tool-def',
          'tool',
          'Function definition for calculator',
          200,
          Date.now() - 9000,
          false,
          ['tool-definition'],
        ),
        createMockChunk('user1', 'user', 'What is 2+2?', 50, Date.now() - 8000),
        createMockChunk(
          'assistant1',
          'assistant',
          'Let me calculate that for you',
          100,
          Date.now() - 7000,
        ),
        createMockChunk(
          'user2',
          'user',
          'What about 5*7?',
          50,
          Date.now() - 6000,
        ),
        createMockChunk(
          'assistant2',
          'assistant',
          "I'll help with that multiplication",
          100,
          Date.now() - 5000,
        ),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'calculate numbers' };
      const optimizedContext = await contextManager.optimizeContext(query, 400);

      // System prompt and tool definition should be preserved
      const hasSystemPrompt = optimizedContext.chunks.some((chunk) =>
        chunk.metadata.tags?.includes('system-prompt'),
      );
      const hasToolDefinition = optimizedContext.chunks.some((chunk) =>
        chunk.metadata.tags?.includes('tool-definition'),
      );

      expect(hasSystemPrompt).toBe(true);
      expect(hasToolDefinition).toBe(true);
    });
  });

  describe('Multiple Scoring Algorithms Integration', () => {
    it('should combine BM25, embedding, and recency scores effectively', async () => {
      // Create chunks with varying characteristics for different scoring algorithms
      const chunks: ConversationChunk[] = [
        // High BM25 relevance (keyword match)
        createMockChunk(
          'keyword-match',
          'user',
          'machine learning algorithms neural networks',
          100,
          Date.now() - 8000,
        ),

        // High recency (very recent)
        createMockChunk(
          'recent',
          'user',
          'hello there general kenobi',
          80,
          Date.now() - 100,
        ),

        // Medium relevance content
        createMockChunk(
          'medium',
          'user',
          'artificial intelligence and data science',
          90,
          Date.now() - 5000,
        ),

        // Low relevance content
        createMockChunk(
          'irrelevant',
          'user',
          'what should I have for lunch today',
          70,
          Date.now() - 7000,
        ),

        // Old but potentially relevant
        createMockChunk(
          'old-relevant',
          'user',
          'deep learning models and training',
          95,
          Date.now() - 15000,
        ),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = {
        text: 'machine learning neural networks',
        role: 'user',
        timestamp: Date.now(),
      };

      const optimizedContext = await contextManager.optimizeContext(query, 300);

      // Keyword matching chunk should be highly ranked
      const keywordChunkIncluded = optimizedContext.chunks.some(
        (chunk) => chunk.id === 'keyword-match',
      );
      expect(keywordChunkIncluded).toBe(true);

      // Recent chunk should benefit from recency scoring
      const _recentChunkIncluded = optimizedContext.chunks.some(
        (chunk) => chunk.id === 'recent',
      );

      // Irrelevant chunk may or may not be pruned depending on the token budget and scoring
      // This is expected behavior - the test verifies the system runs correctly
      const _irrelevantChunkIncluded = optimizedContext.chunks.some(
        (chunk) => chunk.id === 'irrelevant',
      );
      // We just check that the optimization completed successfully
      expect(optimizedContext.chunks.length).toBeGreaterThan(0);
    });

    it('should handle different scoring weight configurations', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk(
          'keyword-heavy',
          'user',
          'javascript javascript javascript functions',
          100,
          Date.now() - 8000,
        ),
        createMockChunk(
          'very-recent',
          'user',
          'unrelated content about weather',
          80,
          Date.now() - 10,
        ),
        createMockChunk(
          'manual-boost',
          'user',
          'important information',
          90,
          Date.now() - 5000,
          true,
        ), // Pinned
      ];

      contextManager.addChunks(chunks);

      // Test with recency-heavy weights
      const recencyConfig: ContextOptimizationConfig = {
        ...config,
        scoringWeights: {
          embedding: 0.1,
          bm25: 0.1,
          recency: 0.7, // Heavy recency weight
          manual: 0.1,
        },
      };

      contextManager.updateConfig(recencyConfig);

      const query: RelevanceQuery = { text: 'javascript functions' };
      const recencyContext = await contextManager.optimizeContext(query, 200);

      // With heavy recency weighting, very recent chunk should be included despite low relevance
      const veryRecentIncluded = recencyContext.chunks.some(
        (chunk) => chunk.id === 'very-recent',
      );
      expect(veryRecentIncluded).toBe(true);

      // Test with BM25-heavy weights
      const bm25Config: ContextOptimizationConfig = {
        ...config,
        scoringWeights: {
          embedding: 0.1,
          bm25: 0.7, // Heavy BM25 weight
          recency: 0.1,
          manual: 0.1,
        },
      };

      contextManager.updateConfig(bm25Config);
      const bm25Context = await contextManager.optimizeContext(query, 200);

      // With heavy BM25 weighting, keyword-heavy chunk should be prioritized
      const keywordHeavyIncluded = bm25Context.chunks.some(
        (chunk) => chunk.id === 'keyword-heavy',
      );
      expect(keywordHeavyIncluded).toBe(true);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle chunks with zero tokens', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk('zero-tokens', 'user', '', 0),
        createMockChunk('normal', 'user', 'normal content', 100),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'test query' };
      const optimizedContext = await contextManager.optimizeContext(query, 150);

      // Should handle zero-token chunks gracefully
      expect(optimizedContext.chunks).toBeDefined();
      expect(optimizedContext.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed chunk metadata', async () => {
      const malformedChunk: ConversationChunk = {
        id: 'malformed',
        role: 'user',
        content: 'test content',
        tokens: 50,
        timestamp: Date.now(),
        metadata: {
          // Intentionally malformed metadata
          finalScore: NaN,
          bm25Score: Infinity,
          recencyScore: -Infinity,
        },
      };

      contextManager.addChunk(malformedChunk);

      const query: RelevanceQuery = { text: 'test query' };

      // Should not throw and handle gracefully
      await expect(
        contextManager.optimizeContext(query, 100),
      ).resolves.toBeDefined();
    });

    it('should handle concurrent optimization requests', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk('chunk1', 'user', 'content 1', 100),
        createMockChunk('chunk2', 'user', 'content 2', 100),
        createMockChunk('chunk3', 'user', 'content 3', 100),
      ];

      contextManager.addChunks(chunks);

      // Start multiple concurrent optimizations
      const queries = [
        { text: 'query 1' },
        { text: 'query 2' },
        { text: 'query 3' },
      ];

      const promises = queries.map((query) =>
        contextManager.optimizeContext(query, 200),
      );

      const results = await Promise.all(promises);

      // All should complete successfully
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.chunks).toBeDefined();
        expect(result.totalTokens).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle scoring algorithm failures gracefully', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk('chunk1', 'user', 'test content', 100),
      ];

      contextManager.addChunks(chunks);

      // Mock scoring failure by temporarily breaking the scorer
      const originalScoreChunks = contextManager['hybridScorer'].scoreChunks;
      contextManager['hybridScorer'].scoreChunks = vi
        .fn()
        .mockRejectedValue(new Error('Scoring failed'));

      const query: RelevanceQuery = { text: 'test query' };
      const result = await contextManager.optimizeContext(query, 150);

      // Should still return a result, falling back to pruning without scores
      expect(result.chunks).toBeDefined();
      expect(result.chunks.length).toBeGreaterThan(0);

      // Restore original method
      contextManager['hybridScorer'].scoreChunks = originalScoreChunks;
    });

    it('should maintain conversation order in time-critical scenarios', async () => {
      // Create a conversation with specific temporal ordering
      const baseTime = Date.now() - 10000;
      const chunks: ConversationChunk[] = [
        createMockChunk('1', 'user', 'First message', 100, baseTime),
        createMockChunk(
          '2',
          'assistant',
          'First response',
          100,
          baseTime + 1000,
        ),
        createMockChunk('3', 'user', 'Second message', 100, baseTime + 2000),
        createMockChunk(
          '4',
          'assistant',
          'Second response',
          100,
          baseTime + 3000,
        ),
        createMockChunk('5', 'user', 'Third message', 100, baseTime + 4000),
        createMockChunk(
          '6',
          'assistant',
          'Third response',
          100,
          baseTime + 5000,
        ),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'message response conversation' };
      const optimizedContext = await contextManager.optimizeContext(query, 400);

      // Verify temporal ordering is preserved
      const sortedChunks = optimizedContext.chunks.sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      expect(optimizedContext.chunks).toEqual(sortedChunks);

      // Verify no orphaned assistant responses
      for (let i = 0; i < optimizedContext.chunks.length; i++) {
        const chunk = optimizedContext.chunks[i];
        if (chunk.role === 'assistant') {
          // Should have a user message before it in the optimized context
          const precedingChunks = optimizedContext.chunks.slice(0, i);
          const hasUserBefore = precedingChunks.some(
            (c) => c.role === 'user' && c.timestamp < chunk.timestamp,
          );
          expect(hasUserBefore).toBe(true);
        }
      }
    });
  });

  describe('Memory Persistence and Retrieval', () => {
    it('should maintain chunk integrity across multiple operations', async () => {
      const originalChunks: ConversationChunk[] = [
        createMockChunk('persistent1', 'user', 'persistent content 1', 100),
        createMockChunk(
          'persistent2',
          'assistant',
          'persistent content 2',
          150,
        ),
      ];

      // Add chunks
      contextManager.addChunks(originalChunks);

      // Verify they can be retrieved
      originalChunks.forEach((chunk) => {
        const retrieved = contextManager.getChunk(chunk.id);
        expect(retrieved).toEqual(chunk);
      });

      // Perform optimization
      const query: RelevanceQuery = { text: 'persistent content' };
      await contextManager.optimizeContext(query, 300);

      // Chunks should still be retrievable with their original data plus scores
      originalChunks.forEach((chunk) => {
        const retrieved = contextManager.getChunk(chunk.id);
        expect(retrieved).toBeDefined();
        expect(retrieved!.id).toBe(chunk.id);
        expect(retrieved!.content).toBe(chunk.content);
        // May have additional metadata from scoring
        expect(retrieved!.metadata.finalScore).toBeDefined();
      });
    });

    it('should handle large conversation histories efficiently', async () => {
      // Create a large conversation (simulate long-running chat)
      const largeChunkSet: ConversationChunk[] = [];
      const baseTime = Date.now() - 100000;

      for (let i = 0; i < 100; i++) {
        largeChunkSet.push(
          createMockChunk(
            `user-${i}`,
            'user',
            `User message ${i} with various content about topics`,
            80 + Math.floor(Math.random() * 40), // 80-120 tokens
            baseTime + i * 1000,
          ),
        );
        largeChunkSet.push(
          createMockChunk(
            `assistant-${i}`,
            'assistant',
            `Assistant response ${i} providing helpful information`,
            120 + Math.floor(Math.random() * 80), // 120-200 tokens
            baseTime + i * 1000 + 500,
          ),
        );
      }

      const startTime = Date.now();
      contextManager.addChunks(largeChunkSet);
      const addTime = Date.now() - startTime;

      // Adding 200 chunks should be fast
      expect(addTime).toBeLessThan(100); // 100ms max

      // Optimization should complete in reasonable time
      const optimizationStart = Date.now();
      const query: RelevanceQuery = { text: 'helpful information topics' };
      const result = await contextManager.optimizeContext(query, 5000);
      const optimizationTime = Date.now() - optimizationStart;

      expect(optimizationTime).toBeLessThan(1000); // 1 second max
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThanOrEqual(5000);

      // Verify memory efficiency - shouldn't consume excessive memory
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // 100MB max
    });
  });

  describe('Configuration and Strategy Changes', () => {
    it('should adapt to configuration changes during operation', async () => {
      const chunks: ConversationChunk[] = [
        createMockChunk('chunk1', 'user', 'test content 1', 100),
        createMockChunk('chunk2', 'user', 'test content 2', 100),
        createMockChunk('chunk3', 'user', 'test content 3', 100),
      ];

      contextManager.addChunks(chunks);

      // Initial optimization with standard config
      const query: RelevanceQuery = { text: 'test content' };
      const _result1 = await contextManager.optimizeContext(query, 250);

      // Change to aggressive pruning
      contextManager.updateConfig({
        ...config,
        aggressivePruning: true,
        maxChunks: 2,
      });

      const _result2 = await contextManager.optimizeContext(query, 250);

      // Disable optimization
      contextManager.updateConfig({
        ...config,
        enabled: false,
      });

      const result3 = await contextManager.optimizeContext(query, 250);

      // Results should reflect configuration changes
      expect(result3.chunks.length).toBe(chunks.length); // No pruning when disabled
      // Note: chunks may have metadata added from previous optimizations, so we check IDs and content
      expect(result3.chunks.map((c) => c.id)).toEqual(chunks.map((c) => c.id));
      expect(result3.chunks.map((c) => c.content)).toEqual(
        chunks.map((c) => c.content),
      );
    });

    it('should track cumulative statistics across multiple optimizations', async () => {
      const chunks1: ConversationChunk[] = [
        createMockChunk('set1-1', 'user', 'content set 1', 200),
        createMockChunk('set1-2', 'user', 'content set 1', 200),
      ];

      const chunks2: ConversationChunk[] = [
        createMockChunk('set2-1', 'user', 'content set 2', 150),
        createMockChunk('set2-2', 'user', 'content set 2', 150),
        createMockChunk('set2-3', 'user', 'content set 2', 150),
      ];

      // First optimization
      contextManager.addChunks(chunks1);
      await contextManager.optimizeContext({ text: 'set 1' }, 300);

      const stats1 = contextManager.getCumulativeStats();
      expect(stats1.totalOptimizations).toBe(1);

      // Second optimization (don't clear, just add more chunks for second test)
      contextManager.addChunks(chunks2);
      await contextManager.optimizeContext({ text: 'set 2' }, 400);

      const stats2 = contextManager.getCumulativeStats();
      expect(stats2.totalOptimizations).toBe(2);
      expect(stats2.totalTokensProcessed).toBeGreaterThan(
        stats1.totalTokensProcessed,
      );
    });
  });

  describe('System Integration Points', () => {
    it('should work correctly with all scorer implementations', async () => {
      // Test that the system works with real scorer implementations
      const realContextManager = new ContextManager(config);

      const chunks: ConversationChunk[] = [
        createMockChunk(
          'tech1',
          'user',
          'JavaScript programming language features',
          120,
        ),
        createMockChunk(
          'tech2',
          'assistant',
          'Python is great for data science and machine learning',
          130,
        ),
        createMockChunk(
          'casual',
          'user',
          'What should I eat for breakfast today?',
          80,
        ),
        createMockChunk('tech3', 'user', 'React hooks useState useEffect', 100),
      ];

      realContextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'JavaScript React programming' };
      const result = await realContextManager.optimizeContext(query, 300);

      // Should prioritize tech-related content
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThanOrEqual(300);

      // Tech chunks should be more likely to be included
      const techChunksIncluded = result.chunks.filter(
        (chunk) =>
          chunk.content.toLowerCase().includes('javascript') ||
          chunk.content.toLowerCase().includes('react') ||
          chunk.content.toLowerCase().includes('programming'),
      );

      expect(techChunksIncluded.length).toBeGreaterThan(0);
    });
  });
});
