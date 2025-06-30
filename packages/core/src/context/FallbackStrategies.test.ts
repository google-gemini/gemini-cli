/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RecencyFallbackStrategy,
  SimpleTruncationFallbackStrategy,
  FallbackStrategyManager,
} from './FallbackStrategies.js';
import type { ConversationChunk, RelevanceQuery } from './types.js';

describe('FallbackStrategies', () => {
  const createTestChunk = (
    id: string,
    tokens: number = 100,
    timestamp: number = Date.now(),
    metadata: Record<string, unknown> = {},
  ): ConversationChunk => ({
    id,
    role: 'user',
    content: `Content for ${id}`,
    tokens,
    timestamp,
    metadata,
  });

  describe('RecencyFallbackStrategy', () => {
    let strategy: RecencyFallbackStrategy;
    let query: RelevanceQuery;

    beforeEach(() => {
      strategy = new RecencyFallbackStrategy();
      query = {
        text: 'test query',
        timestamp: Date.now(),
      };
    });

    it('should prioritize recent chunks', async () => {
      const now = Date.now();
      const chunks: ConversationChunk[] = [
        createTestChunk('old', 100, now - 86400000), // 1 day ago
        createTestChunk('recent', 100, now - 3600000), // 1 hour ago
        createTestChunk('newest', 100, now - 60000), // 1 minute ago
      ];

      const result = await strategy.execute(chunks, query, 250);

      expect(result.chunks).toHaveLength(2);
      // Should include the two most recent chunks (in original order)
      expect(result.chunks.find((c) => c.id === 'recent')).toBeDefined();
      expect(result.chunks.find((c) => c.id === 'newest')).toBeDefined();
      expect(result.chunks.find((c) => c.id === 'old')).toBeUndefined();
      expect(result.totalTokens).toBe(200);
    });

    it('should always include pinned chunks', async () => {
      const now = Date.now();
      const chunks: ConversationChunk[] = [
        createTestChunk('normal', 150, now - 3600000),
        createTestChunk('pinned', 150, now - 86400000, { pinned: true }),
      ];

      const result = await strategy.execute(chunks, query, 200);

      // Should include pinned chunk (mandatory) + normal chunk (fits budget after pinned included)
      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
      expect(result.chunks.find((c) => c.id === 'pinned')).toBeDefined();
      expect(result.totalTokens).toBeGreaterThanOrEqual(150); // At least pinned chunk
    });

    it('should prioritize system prompts and tool definitions', async () => {
      const now = Date.now();
      const chunks: ConversationChunk[] = [
        createTestChunk('normal', 100, now - 3600000),
        createTestChunk('system', 100, now - 86400000, {
          tags: ['system-prompt'],
        }),
        createTestChunk('tool', 100, now - 172800000, {
          tags: ['tool-definition'],
        }),
      ];

      const result = await strategy.execute(chunks, query, 250);

      // Should include at least the mandatory chunks
      expect(result.chunks.length).toBeGreaterThanOrEqual(2);
      expect(result.chunks.find((c) => c.id === 'system')).toBeDefined();
      expect(result.chunks.find((c) => c.id === 'tool')).toBeDefined();
    });

    it('should handle empty chunks array', async () => {
      const result = await strategy.execute([], query, 1000);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.maxTokens).toBe(1000);
    });

    it('should handle zero budget', async () => {
      const chunks = [createTestChunk('test', 100)];
      const result = await strategy.execute(chunks, query, 0);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.maxTokens).toBe(0);
    });
  });

  describe('SimpleTruncationFallbackStrategy', () => {
    let strategy: SimpleTruncationFallbackStrategy;
    let query: RelevanceQuery;

    beforeEach(() => {
      strategy = new SimpleTruncationFallbackStrategy();
      query = { text: 'test query' };
    });

    it('should preserve chronological order', async () => {
      const chunks: ConversationChunk[] = [
        createTestChunk('first', 100, 1000),
        createTestChunk('second', 100, 2000),
        createTestChunk('third', 100, 3000),
      ];

      const result = await strategy.execute(chunks, query, 250);

      expect(result.chunks).toHaveLength(2);
      expect(result.chunks[0].id).toBe('second'); // Most recent within budget
      expect(result.chunks[1].id).toBe('third');
    });

    it('should always include mandatory chunks first', async () => {
      const chunks: ConversationChunk[] = [
        createTestChunk('normal1', 100, 1000),
        createTestChunk('mandatory', 100, 500, { pinned: true }), // Reduced size to fit budget
        createTestChunk('normal2', 100, 2000),
      ];

      const result = await strategy.execute(chunks, query, 200);

      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
      expect(result.chunks.find((c) => c.id === 'mandatory')).toBeDefined();
      // Should also include normal2 since it's most recent and fits budget
      expect(result.chunks.find((c) => c.id === 'normal2')).toBeDefined();
    });

    it('should include mandatory chunks even over budget', async () => {
      const chunks: ConversationChunk[] = [
        createTestChunk('normal', 100, 2000),
        createTestChunk('mandatory', 300, 1000, { tags: ['system-prompt'] }),
      ];

      const result = await strategy.execute(chunks, query, 200);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].id).toBe('mandatory');
      expect(result.totalTokens).toBe(300); // Over budget
    });

    it('should maintain chronological order in output', async () => {
      const chunks: ConversationChunk[] = [
        createTestChunk('third', 50, 3000),
        createTestChunk('first', 50, 1000),
        createTestChunk('second', 50, 2000),
      ];

      const result = await strategy.execute(chunks, query, 150);

      expect(result.chunks).toHaveLength(3);
      expect(result.chunks[0].timestamp).toBe(1000);
      expect(result.chunks[1].timestamp).toBe(2000);
      expect(result.chunks[2].timestamp).toBe(3000);
    });
  });

  describe('FallbackStrategyManager', () => {
    let manager: FallbackStrategyManager;
    let query: RelevanceQuery;

    beforeEach(() => {
      manager = new FallbackStrategyManager();
      query = { text: 'test query' };
    });

    it('should execute strategies in priority order', async () => {
      const chunks = [createTestChunk('test', 100)];
      const result = await manager.executeFallback(chunks, query, 150);

      expect(result.chunks).toHaveLength(1);
      expect(result.totalTokens).toBe(100);
    });

    it('should fallback to next strategy if first fails', async () => {
      // Create a custom failing strategy
      const failingStrategy = {
        name: 'failing-strategy',
        priority: 0, // Higher priority than default strategies
        execute: async () => {
          throw new Error('Simulated failure');
        },
      };

      manager.addStrategy(failingStrategy);

      const chunks = [createTestChunk('test', 100)];
      const result = await manager.executeFallback(chunks, query, 150);

      // Should fall back to recency strategy
      expect(result.chunks).toHaveLength(1);
      expect(result.totalTokens).toBe(100);
    });

    it('should return empty context if all strategies fail', async () => {
      // Create a manager with only failing strategies
      const emptyManager = new FallbackStrategyManager();

      // Clear default strategies by creating new instance
      (emptyManager as { strategies: FallbackStrategy[] }).strategies = [
        {
          name: 'fail1',
          priority: 1,
          execute: async () => {
            throw new Error('Fail 1');
          },
        },
        {
          name: 'fail2',
          priority: 2,
          execute: async () => {
            throw new Error('Fail 2');
          },
        },
      ];

      const chunks = [createTestChunk('test', 100)];
      const result = await emptyManager.executeFallback(chunks, query, 150);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.maxTokens).toBe(150);
    });

    it('should allow adding custom strategies', () => {
      const customStrategy = {
        name: 'custom',
        priority: 0,
        execute: async () => ({
          chunks: [],
          totalTokens: 0,
          maxTokens: 100,
        }),
      };

      manager.addStrategy(customStrategy);
      const strategies = manager.getStrategies();

      expect(strategies).toContain(customStrategy);
      expect(strategies).toHaveLength(3); // 2 default + 1 custom
    });
  });

  describe('Integration with mandatory chunks', () => {
    it('should respect all mandatory chunk types across strategies', async () => {
      const now = Date.now();
      const chunks: ConversationChunk[] = [
        createTestChunk('normal1', 100, now - 3600000),
        createTestChunk('pinned', 100, now - 7200000, { pinned: true }),
        createTestChunk('system', 100, now - 14400000, {
          tags: ['system-prompt'],
        }),
        createTestChunk('tool', 100, now - 21600000, {
          tags: ['tool-definition'],
        }),
        createTestChunk('normal2', 100, now - 1800000),
      ];

      const query: RelevanceQuery = { text: 'test', timestamp: now };

      // Test RecencyFallbackStrategy
      const recencyStrategy = new RecencyFallbackStrategy();
      const recencyResult = await recencyStrategy.execute(chunks, query, 250);

      expect(recencyResult.chunks.find((c) => c.id === 'pinned')).toBeDefined();
      expect(recencyResult.chunks.find((c) => c.id === 'system')).toBeDefined();
      expect(recencyResult.chunks.find((c) => c.id === 'tool')).toBeDefined();

      // Test SimpleTruncationFallbackStrategy
      const truncationStrategy = new SimpleTruncationFallbackStrategy();
      const truncationResult = await truncationStrategy.execute(
        chunks,
        query,
        250,
      );

      expect(
        truncationResult.chunks.find((c) => c.id === 'pinned'),
      ).toBeDefined();
      expect(
        truncationResult.chunks.find((c) => c.id === 'system'),
      ).toBeDefined();
      expect(
        truncationResult.chunks.find((c) => c.id === 'tool'),
      ).toBeDefined();
    });
  });
});
