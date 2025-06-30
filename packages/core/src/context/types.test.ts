/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type {
  ConversationChunk,
  ChunkMetadata,
  ScoringWeights,
  ContextWindow,
  ContextOptimizationConfig,
  RelevanceQuery,
  ScoringResult,
  PruningStats,
} from './types.js';

describe('Context Types', () => {
  describe('ConversationChunk', () => {
    it('should have all required properties', () => {
      const chunk: ConversationChunk = {
        id: 'test-chunk-1',
        role: 'user',
        content: 'Hello, how can I help?',
        tokens: 10,
        timestamp: Date.now(),
        metadata: {
          finalScore: 0.8,
          pinned: false,
        },
      };

      expect(chunk.id).toBe('test-chunk-1');
      expect(chunk.role).toBe('user');
      expect(chunk.content).toBe('Hello, how can I help?');
      expect(chunk.tokens).toBe(10);
      expect(typeof chunk.timestamp).toBe('number');
      expect(chunk.metadata).toBeDefined();
    });

    it('should support all role types', () => {
      const userChunk: ConversationChunk = {
        id: '1',
        role: 'user',
        content: 'test',
        tokens: 1,
        timestamp: 1,
        metadata: {},
      };

      const assistantChunk: ConversationChunk = {
        id: '2',
        role: 'assistant',
        content: 'test',
        tokens: 1,
        timestamp: 1,
        metadata: {},
      };

      const toolChunk: ConversationChunk = {
        id: '3',
        role: 'tool',
        content: 'test',
        tokens: 1,
        timestamp: 1,
        metadata: {},
      };

      expect(userChunk.role).toBe('user');
      expect(assistantChunk.role).toBe('assistant');
      expect(toolChunk.role).toBe('tool');
    });
  });

  describe('ChunkMetadata', () => {
    it('should support optional scoring fields', () => {
      const metadata: ChunkMetadata = {
        bm25Score: 0.7,
        recencyScore: 0.9,
        finalScore: 0.8,
        pinned: true,
        tags: ['code', 'typescript'],
      };

      expect(metadata.bm25Score).toBe(0.7);
      expect(metadata.recencyScore).toBe(0.9);
      expect(metadata.finalScore).toBe(0.8);
      expect(metadata.pinned).toBe(true);
      expect(metadata.tags).toEqual(['code', 'typescript']);
    });

    it('should support embedding vectors', () => {
      const metadata: ChunkMetadata = {
        embedding: [0.1, 0.2, 0.3, 0.4],
        finalScore: 0.5,
      };

      expect(metadata.embedding).toHaveLength(4);
      expect(metadata.embedding?.[0]).toBe(0.1);
    });
  });

  describe('ScoringWeights', () => {
    it('should define all weight categories', () => {
      const weights: ScoringWeights = {
        embedding: 0.4,
        bm25: 0.4,
        recency: 0.15,
        manual: 0.05,
      };

      expect(weights.embedding).toBe(0.4);
      expect(weights.bm25).toBe(0.4);
      expect(weights.recency).toBe(0.15);
      expect(weights.manual).toBe(0.05);
    });

    it('should allow weights to sum to 1.0', () => {
      const weights: ScoringWeights = {
        embedding: 0.4,
        bm25: 0.4,
        recency: 0.15,
        manual: 0.05,
      };

      const sum = weights.embedding + weights.bm25 + weights.recency + weights.manual;
      expect(sum).toBe(1.0);
    });
  });

  describe('ContextWindow', () => {
    it('should track chunks and token limits', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'test',
          tokens: 50,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'response',
          tokens: 75,
          timestamp: 2,
          metadata: {},
        },
      ];

      const window: ContextWindow = {
        chunks,
        totalTokens: 125,
        maxTokens: 1000,
      };

      expect(window.chunks).toHaveLength(2);
      expect(window.totalTokens).toBe(125);
      expect(window.maxTokens).toBe(1000);
    });
  });

  describe('ContextOptimizationConfig', () => {
    it('should define configuration options', () => {
      const config: ContextOptimizationConfig = {
        enabled: true,
        maxChunks: 200,
        embeddingEnabled: false,
        aggressivePruning: false,
        scoringWeights: {
          embedding: 0.4,
          bm25: 0.4,
          recency: 0.15,
          manual: 0.05,
        },
      };

      expect(config.enabled).toBe(true);
      expect(config.maxChunks).toBe(200);
      expect(config.embeddingEnabled).toBe(false);
      expect(config.aggressivePruning).toBe(false);
      expect(config.scoringWeights).toBeDefined();
    });
  });

  describe('RelevanceQuery', () => {
    it('should define query parameters', () => {
      const query: RelevanceQuery = {
        text: 'How do I implement authentication?',
        role: 'user',
        timestamp: Date.now(),
        tags: ['auth', 'security'],
      };

      expect(query.text).toBe('How do I implement authentication?');
      expect(query.role).toBe('user');
      expect(typeof query.timestamp).toBe('number');
      expect(query.tags).toEqual(['auth', 'security']);
    });

    it('should work with minimal required fields', () => {
      const query: RelevanceQuery = {
        text: 'Simple query',
      };

      expect(query.text).toBe('Simple query');
      expect(query.role).toBeUndefined();
      expect(query.timestamp).toBeUndefined();
      expect(query.tags).toBeUndefined();
    });
  });

  describe('ScoringResult', () => {
    it('should provide score breakdown', () => {
      const result: ScoringResult = {
        chunkId: 'chunk-1',
        score: 0.85,
        breakdown: {
          embedding: 0.9,
          bm25: 0.8,
          recency: 0.7,
          manual: 1.0,
        },
      };

      expect(result.chunkId).toBe('chunk-1');
      expect(result.score).toBe(0.85);
      expect(result.breakdown.embedding).toBe(0.9);
      expect(result.breakdown.bm25).toBe(0.8);
      expect(result.breakdown.recency).toBe(0.7);
      expect(result.breakdown.manual).toBe(1.0);
    });
  });

  describe('PruningStats', () => {
    it('should track pruning metrics', () => {
      const stats: PruningStats = {
        originalChunks: 100,
        prunedChunks: 65,
        originalTokens: 50000,
        prunedTokens: 32500,
        reductionPercentage: 35,
        processingTimeMs: 25,
      };

      expect(stats.originalChunks).toBe(100);
      expect(stats.prunedChunks).toBe(65);
      expect(stats.originalTokens).toBe(50000);
      expect(stats.prunedTokens).toBe(32500);
      expect(stats.reductionPercentage).toBe(35);
      expect(stats.processingTimeMs).toBe(25);
    });

    it('should calculate reduction percentage correctly', () => {
      const originalTokens = 1000;
      const prunedTokens = 700;
      const expectedReduction = ((originalTokens - prunedTokens) / originalTokens) * 100;

      const stats: PruningStats = {
        originalChunks: 50,
        prunedChunks: 35,
        originalTokens,
        prunedTokens,
        reductionPercentage: expectedReduction,
        processingTimeMs: 10,
      };

      expect(stats.reductionPercentage).toBe(30);
    });
  });
});