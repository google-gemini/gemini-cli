/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextLogger } from './ContextLogger.js';
import type { ConversationChunk, ScoringResult, PruningStats } from './types.js';

describe('ContextLogger', () => {
  let logger: ContextLogger;
  let consoleSpy: any;

  beforeEach(() => {
    logger = new ContextLogger('debug');
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logOptimizationStart', () => {
    it('should log optimization start with chunk details', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          tokens: 5,
          timestamp: 1000,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there',
          tokens: 10,
          timestamp: 2000,
          metadata: {},
        },
      ];

      logger.logOptimizationStart('test query', chunks, 1000);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Context optimization started: 2 chunks (15 tokens) -> budget: 1000 tokens')
      );

      const events = logger.exportLogs();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('optimization_start');
      expect(events[0].data.chunksCount).toBe(2);
      expect(events[0].data.totalTokens).toBe(15);
    });

    it('should truncate long queries in logs', () => {
      const longQuery = 'a'.repeat(200);
      const chunks: ConversationChunk[] = [];

      logger.logOptimizationStart(longQuery, chunks, 1000);

      const events = logger.exportLogs();
      expect(events[0].data.query).toHaveLength(103); // 100 + "..."
      expect(events[0].data.query).toEndWith('...');
    });
  });

  describe('logScoringComplete', () => {
    it('should log scoring results with breakdown', () => {
      const results: ScoringResult[] = [
        {
          chunkId: '1',
          score: 0.8,
          breakdown: { bm25: 0.7, recency: 0.9, embedding: 0.8 },
        },
        {
          chunkId: '2',
          score: 0.6,
          breakdown: { bm25: 0.5, recency: 0.7, embedding: 0.6 },
        },
      ];

      logger.logScoringComplete(results, 50);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Scoring complete: 2 chunks in 50ms')
      );

      const events = logger.exportLogs();
      expect(events[0].type).toBe('scoring_complete');
      expect(events[0].data.processingTimeMs).toBe(50);
      expect(events[0].data.breakdown.bm25Average).toBe(0.6);
      expect(events[0].data.breakdown.recencyAverage).toBe(0.8);
    });
  });

  describe('logPruningComplete', () => {
    it('should log pruning statistics', () => {
      const stats: PruningStats = {
        originalChunks: 100,
        prunedChunks: 60,
        originalTokens: 5000,
        prunedTokens: 3000,
        reductionPercentage: 40,
        processingTimeMs: 25,
      };

      const selectedChunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 5,
          timestamp: 1000,
          metadata: {},
        },
      ];

      logger.logPruningComplete(stats, 5, selectedChunks);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Pruning complete: 100 -> 60 chunks (40.0% reduction)')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Mandatory chunks preserved: 5')
      );

      const events = logger.exportLogs();
      expect(events[0].type).toBe('pruning_complete');
      expect(events[0].data.mandatoryChunks).toBe(5);
    });
  });

  describe('logOptimizationComplete', () => {
    it('should log complete optimization details', () => {
      const logEntry = {
        query: 'test query',
        originalChunks: 100,
        finalChunks: 60,
        originalTokens: 5000,
        finalTokens: 3000,
        reductionPercentage: 40,
        processingTimeMs: 75,
        scoringBreakdown: {
          bm25Average: 0.6,
          recencyAverage: 0.8,
          embeddingAverage: 0.7,
          hybridAverage: 0.7,
        },
        mandatoryChunks: 5,
        prunedChunks: ['1', '2', '3'],
        topScoredChunks: [
          { id: 'top1', score: 0.95, tokens: 10 },
          { id: 'top2', score: 0.90, tokens: 15 },
        ],
      };

      logger.logOptimizationComplete(logEntry);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Context optimization complete:')
      );
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing time: 75ms')
      );

      const events = logger.exportLogs();
      expect(events[0].type).toBe('optimization_complete');
      expect(events[0].data).toEqual(logEntry);
    });
  });

  describe('logError', () => {
    it('should log errors with context', () => {
      const error = new Error('Test error');
      const context = 'scoring phase';
      const additionalData = { chunkId: '123' };

      logger.logError(error, context, additionalData);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Context optimization error in scoring phase:'),
        'Test error'
      );

      const events = logger.exportLogs();
      expect(events[0].type).toBe('error');
      expect(events[0].data.error).toBe('Test error');
      expect(events[0].data.context).toBe(context);
    });
  });

  describe('getRecentStats', () => {
    it('should return recent optimization stats', () => {
      // Add multiple optimization complete events
      for (let i = 0; i < 5; i++) {
        logger.logOptimizationComplete({
          query: `query ${i}`,
          originalChunks: 100 + i,
          finalChunks: 60 + i,
          originalTokens: 5000 + i * 100,
          finalTokens: 3000 + i * 60,
          reductionPercentage: 40 + i,
          processingTimeMs: 50 + i * 5,
          scoringBreakdown: {
            bm25Average: 0.6,
            recencyAverage: 0.8,
            embeddingAverage: 0.7,
            hybridAverage: 0.7,
          },
          mandatoryChunks: 5,
          prunedChunks: [],
          topScoredChunks: [],
        });
      }

      const recentStats = logger.getRecentStats(3);
      expect(recentStats).toHaveLength(3);
      expect(recentStats[0].query).toBe('query 2'); // Most recent 3
      expect(recentStats[2].query).toBe('query 4');
    });
  });

  describe('getPerformanceSummary', () => {
    it('should calculate performance metrics', () => {
      // Add some optimization events
      logger.logOptimizationComplete({
        query: 'query 1',
        originalChunks: 100,
        finalChunks: 60,
        originalTokens: 5000,
        finalTokens: 3000,
        reductionPercentage: 40,
        processingTimeMs: 50,
        scoringBreakdown: {
          bm25Average: 0.6,
          recencyAverage: 0.8,
          embeddingAverage: 0.7,
          hybridAverage: 0.7,
        },
        mandatoryChunks: 5,
        prunedChunks: [],
        topScoredChunks: [],
      });

      logger.logOptimizationComplete({
        query: 'query 2',
        originalChunks: 80,
        finalChunks: 50,
        originalTokens: 4000,
        finalTokens: 2500,
        reductionPercentage: 37.5,
        processingTimeMs: 60,
        scoringBreakdown: {
          bm25Average: 0.6,
          recencyAverage: 0.8,
          embeddingAverage: 0.7,
          hybridAverage: 0.7,
        },
        mandatoryChunks: 3,
        prunedChunks: [],
        topScoredChunks: [],
      });

      // Add an error
      logger.logError(new Error('test'), 'test context');

      const summary = logger.getPerformanceSummary();

      expect(summary.totalOptimizations).toBe(2);
      expect(summary.averageProcessingTime).toBe(55); // (50 + 60) / 2
      expect(summary.averageTokenReduction).toBe(38.75); // (40 + 37.5) / 2
      expect(summary.averageChunkReduction).toBe(40); // ((40 + 37.5) / 2)
      expect(summary.errorRate).toBeCloseTo(33.33); // 1 error out of 3 total events
    });

    it('should handle empty stats', () => {
      const summary = logger.getPerformanceSummary();

      expect(summary.totalOptimizations).toBe(0);
      expect(summary.averageProcessingTime).toBe(0);
      expect(summary.averageTokenReduction).toBe(0);
      expect(summary.averageChunkReduction).toBe(0);
      expect(summary.errorRate).toBe(0);
    });
  });

  describe('log levels', () => {
    it('should respect log levels', () => {
      const infoLogger = new ContextLogger('info');
      const chunks: ConversationChunk[] = [];

      infoLogger.logOptimizationStart('test', chunks, 1000);

      // Should log info level
      expect(consoleSpy.log).toHaveBeenCalled();

      consoleSpy.log.mockClear();

      // Debug logging should not appear
      infoLogger.logScoringComplete([], 10);
      expect(consoleSpy.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Scoring complete')
      );
    });

    it('should allow changing log level', () => {
      logger.setLogLevel('error');

      logger.logOptimizationStart('test', [], 1000);
      expect(consoleSpy.log).not.toHaveBeenCalled();

      logger.logError(new Error('test'), 'test');
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('memory management', () => {
    it('should limit maximum events', () => {
      const smallLogger = new ContextLogger('debug');
      // Set private property for testing
      (smallLogger as any).maxEvents = 3;

      // Add more events than the limit
      for (let i = 0; i < 5; i++) {
        smallLogger.logOptimizationStart(`query ${i}`, [], 1000);
      }

      const events = smallLogger.exportLogs();
      expect(events).toHaveLength(3);
      expect(events[0].data.query).toBe('query 2'); // Oldest kept
      expect(events[2].data.query).toBe('query 4'); // Most recent
    });
  });

  describe('clearLogs', () => {
    it('should clear all logs', () => {
      logger.logOptimizationStart('test', [], 1000);
      expect(logger.exportLogs()).toHaveLength(1);

      logger.clearLogs();
      expect(logger.exportLogs()).toHaveLength(0);
    });
  });
});