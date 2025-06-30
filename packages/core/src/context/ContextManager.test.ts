/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from './ContextManager.js';
import type { 
  ConversationChunk, 
  ContextOptimizationConfig, 
  RelevanceQuery 
} from './types.js';

/**
 * Simplified unit tests for ContextManager using real implementations.
 * These tests focus on the core API contract and behavior validation.
 */
describe('ContextManager Unit Tests', () => {
  let contextManager: ContextManager;
  let config: ContextOptimizationConfig;

  const createTestChunk = (
    id: string, 
    role: 'user' | 'assistant' | 'tool' = 'user', 
    content: string = 'test content',
    tokens: number = 100
  ): ConversationChunk => ({
    id,
    role,
    content,
    tokens,
    timestamp: Date.now(),
    metadata: {},
  });

  beforeEach(() => {
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

  describe('Constructor and Configuration', () => {
    it('should initialize with provided config', () => {
      const manager = new ContextManager(config);
      expect(manager).toBeDefined();
      expect(manager.getConfig()).toEqual(config);
    });

    it('should initialize with default config when none provided', () => {
      const manager = new ContextManager();
      const defaultConfig = manager.getConfig();
      
      expect(defaultConfig.enabled).toBe(true);
      expect(defaultConfig.maxChunks).toBe(50);
      expect(defaultConfig.embeddingEnabled).toBe(true);
      expect(defaultConfig.aggressivePruning).toBe(false);
      expect(defaultConfig.scoringWeights).toEqual({
        embedding: 0.4,
        bm25: 0.4,
        recency: 0.15,
        manual: 0.05,
      });
    });

    it('should allow runtime config updates', () => {
      const newConfig: ContextOptimizationConfig = {
        ...config,
        maxChunks: 20,
        aggressivePruning: true,
      };

      contextManager.updateConfig(newConfig);
      expect(contextManager.getConfig()).toEqual(newConfig);
    });

    it('should validate configuration parameters', () => {
      const invalidConfig: any = {
        enabled: 'yes', // Should be boolean
        maxChunks: -1,  // Should be non-negative
        scoringWeights: null, // Should be object
      };

      expect(() => contextManager.updateConfig(invalidConfig)).toThrow();
    });
  });

  describe('Chunk Management API', () => {
    it('should add and retrieve chunks', () => {
      const chunk = createTestChunk('test-1');
      
      contextManager.addChunk(chunk);
      
      const retrieved = contextManager.getChunk('test-1');
      expect(retrieved).toEqual(chunk);
    });

    it('should batch add multiple chunks', () => {
      const chunks = [
        createTestChunk('chunk-1'),
        createTestChunk('chunk-2'),
        createTestChunk('chunk-3'),
      ];

      contextManager.addChunks(chunks);

      chunks.forEach(chunk => {
        const retrieved = contextManager.getChunk(chunk.id);
        expect(retrieved).toEqual(chunk);
      });
    });

    it('should remove chunks', () => {
      const chunk = createTestChunk('removable');
      
      contextManager.addChunk(chunk);
      expect(contextManager.getChunk('removable')).toBeDefined();
      
      const removed = contextManager.removeChunk('removable');
      expect(removed).toBe(true);
      expect(contextManager.getChunk('removable')).toBeUndefined();
    });

    it('should return false when removing non-existent chunk', () => {
      const removed = contextManager.removeChunk('non-existent');
      expect(removed).toBe(false);
    });

    it('should track total tokens', () => {
      const chunks = [
        createTestChunk('chunk-1', 'user', 'content', 100),
        createTestChunk('chunk-2', 'assistant', 'content', 200),
        createTestChunk('chunk-3', 'user', 'content', 150),
      ];

      chunks.forEach(chunk => contextManager.addChunk(chunk));
      
      expect(contextManager.getTotalTokens()).toBe(450);
    });

    it('should clear all chunks and reset stats', () => {
      const chunks = [
        createTestChunk('chunk-1'),
        createTestChunk('chunk-2'),
      ];

      contextManager.addChunks(chunks);
      expect(contextManager.getTotalTokens()).toBeGreaterThan(0);

      contextManager.clear();
      
      expect(contextManager.getTotalTokens()).toBe(0);
      expect(contextManager.getOptimizationStats()).toBeNull();
    });
  });

  describe('Context Optimization', () => {
    it('should optimize context and return valid result', async () => {
      const chunks = [
        createTestChunk('chunk-1', 'user', 'machine learning algorithms', 100),
        createTestChunk('chunk-2', 'assistant', 'response about AI', 150),
        createTestChunk('chunk-3', 'user', 'web development question', 120),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = {
        text: 'machine learning',
        role: 'user',
      };

      const result = await contextManager.optimizeContext(query, 250);

      expect(result.chunks).toBeDefined();
      expect(result.totalTokens).toBeLessThanOrEqual(250);
      expect(result.maxTokens).toBe(250);
      expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle optimization when disabled', async () => {
      const chunks = [createTestChunk('chunk-1')];
      contextManager.addChunks(chunks);
      
      contextManager.updateConfig({ ...config, enabled: false });

      const query: RelevanceQuery = { text: 'test query' };
      const result = await contextManager.optimizeContext(query, 1000);

      // Should return all chunks without optimization
      expect(result.chunks).toEqual(chunks);
      expect(result.totalTokens).toBe(chunks[0].tokens);
    });

    it('should handle empty chunk registry', async () => {
      const query: RelevanceQuery = { text: 'test query' };
      const result = await contextManager.optimizeContext(query, 1000);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.maxTokens).toBe(1000);
    });

    it('should handle zero token budget', async () => {
      const chunks = [createTestChunk('chunk-1')];
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'test query' };
      const result = await contextManager.optimizeContext(query, 0);

      expect(result.chunks).toEqual([]);
      expect(result.totalTokens).toBe(0);
      expect(result.maxTokens).toBe(0);
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track optimization statistics', async () => {
      const chunks = [
        createTestChunk('chunk-1', 'user', 'content', 200),
        createTestChunk('chunk-2', 'assistant', 'content', 300),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'test query' };
      await contextManager.optimizeContext(query, 250);

      const stats = contextManager.getOptimizationStats();
      expect(stats).not.toBeNull();
      expect(stats!.originalChunks).toBe(2);
      expect(stats!.originalTokens).toBe(500);
      expect(stats!.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return null when no optimization performed', () => {
      const stats = contextManager.getOptimizationStats();
      expect(stats).toBeNull();
    });

    it('should track cumulative statistics', async () => {
      const chunks = [createTestChunk('chunk-1', 'user', 'content', 100)];
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'test query' };
      
      // First optimization
      await contextManager.optimizeContext(query, 50);
      let cumStats = contextManager.getCumulativeStats();
      expect(cumStats.totalOptimizations).toBe(1);

      // Second optimization
      await contextManager.optimizeContext(query, 80);
      cumStats = contextManager.getCumulativeStats();
      expect(cumStats.totalOptimizations).toBe(2);
      expect(cumStats.totalTokensProcessed).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed chunks gracefully', async () => {
      const malformedChunk: any = {
        id: 'malformed',
        role: 'user',
        content: 'test',
        tokens: 50,
        timestamp: Date.now(),
        metadata: {
          finalScore: NaN,
          bm25Score: Infinity,
        },
      };

      contextManager.addChunk(malformedChunk);

      const query: RelevanceQuery = { text: 'test query' };
      
      // Should not throw
      await expect(contextManager.optimizeContext(query, 100)).resolves.toBeDefined();
    });

    it('should maintain thread safety with concurrent requests', async () => {
      const chunks = [
        createTestChunk('chunk-1'),
        createTestChunk('chunk-2'),
      ];
      
      contextManager.addChunks(chunks);

      const queries = [
        { text: 'query 1' },
        { text: 'query 2' },
        { text: 'query 3' },
      ];

      const promises = queries.map(query => 
        contextManager.optimizeContext(query, 150)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.chunks).toBeDefined();
        expect(result.totalTokens).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should validate scoring weights', () => {
      const invalidWeights = {
        ...config,
        scoringWeights: {
          embedding: 1.5, // Invalid: > 1
          bm25: -0.1,     // Invalid: < 0
          recency: 0.15,
          manual: 0.05,
        },
      };

      expect(() => contextManager.updateConfig(invalidWeights)).toThrow();
    });

    it('should validate maxChunks parameter', () => {
      const invalidMaxChunks = {
        ...config,
        maxChunks: -5, // Invalid: negative
      };

      expect(() => contextManager.updateConfig(invalidMaxChunks)).toThrow();
    });

    it('should preserve valid configuration on partial failure', () => {
      const originalConfig = contextManager.getConfig();
      
      const partiallyInvalid = {
        ...config,
        maxChunks: -1, // Invalid
      };

      try {
        contextManager.updateConfig(partiallyInvalid);
      } catch {
        // Config should remain unchanged
        expect(contextManager.getConfig()).toEqual(originalConfig);
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle reasonable loads efficiently', async () => {
      // Create a moderate number of chunks
      const chunks = Array.from({ length: 50 }, (_, i) => 
        createTestChunk(`chunk-${i}`, 'user', `Content ${i}`, 100)
      );

      const startTime = Date.now();
      contextManager.addChunks(chunks);
      const addTime = Date.now() - startTime;

      expect(addTime).toBeLessThan(100); // Should be fast

      const query: RelevanceQuery = { text: 'test query' };
      const optimizeStart = Date.now();
      const result = await contextManager.optimizeContext(query, 2000);
      const optimizeTime = Date.now() - optimizeStart;

      expect(optimizeTime).toBeLessThan(500); // Should be reasonably fast
      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });
});