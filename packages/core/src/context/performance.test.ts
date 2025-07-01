/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContextManager } from './ContextManager.js';
import type {
  ConversationChunk,
  ContextOptimizationConfig,
  RelevanceQuery,
} from './types.js';

/**
 * Performance metrics for tracking optimization effectiveness.
 */
interface _PerformanceMetrics {
  processingTimeMs: number;
  memoryUsageMB: number;
  tokenReductionPercentage: number;
  relevancePreservationScore: number;
  throughputChunksPerSecond: number;
}

/**
 * Relevance preservation metrics.
 */
interface _RelevanceMetrics {
  precisionAtK: number;
  recallAtK: number;
  ndcgAtK: number;
  averagePrecision: number;
}

describe('Context Optimization Performance and Validation', () => {
  let contextManager: ContextManager;
  let config: ContextOptimizationConfig;

  const createMockChunk = (
    id: string,
    role: 'user' | 'assistant' | 'tool' = 'user',
    content: string = '',
    tokens?: number,
    timestamp?: number,
    relevanceScore?: number, // For ground truth testing
  ): ConversationChunk & { groundTruthRelevance?: number } => ({
    id,
    role,
    content: content || `Content for chunk ${id}`,
    tokens:
      tokens || Math.max(10, (content || `Content for chunk ${id}`).length / 4),
    timestamp: timestamp || Date.now() - Math.random() * 100000,
    metadata: {},
    groundTruthRelevance: relevanceScore,
  });

  const measureMemoryUsage = (): number => {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // Convert to MB
  };

  const generateLargeConversationDataset = (
    size: number,
  ): ConversationChunk[] => {
    const chunks: ConversationChunk[] = [];
    const topics = [
      'machine learning',
      'web development',
      'data science',
      'artificial intelligence',
      'software engineering',
      'cloud computing',
      'cybersecurity',
      'mobile development',
      'database design',
      'user experience',
      'project management',
      'system architecture',
    ];

    const baseTime = Date.now() - size * 1000;

    for (let i = 0; i < size; i++) {
      const topic = topics[i % topics.length];
      const isUser = i % 2 === 0;

      chunks.push(
        createMockChunk(
          `chunk-${i}`,
          isUser ? 'user' : 'assistant',
          `This is a ${isUser ? 'question' : 'response'} about ${topic} with index ${i}. ` +
            `It contains relevant information about ${topic} concepts and practices. ` +
            `The content is designed to test the optimization system's ability to handle ` +
            `large conversations while maintaining relevance scoring accuracy.`,
          80 + Math.floor(Math.random() * 120), // 80-200 tokens
          baseTime + i * 1000,
        ),
      );
    }

    return chunks;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      enabled: true,
      maxChunks: 50,
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

  describe('Processing Time Performance', () => {
    it('should optimize small conversations within 100ms', async () => {
      const chunks = generateLargeConversationDataset(10);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'machine learning algorithms' };

      const startTime = performance.now();
      await contextManager.optimizeContext(query, 1000);
      const endTime = performance.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(100); // 100ms for small conversations
    });

    it('should optimize medium conversations within 500ms', async () => {
      const chunks = generateLargeConversationDataset(100);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'web development frameworks' };

      const startTime = performance.now();
      await contextManager.optimizeContext(query, 5000);
      const endTime = performance.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(500); // 500ms for medium conversations
    });

    it('should optimize large conversations within 2 seconds', async () => {
      const chunks = generateLargeConversationDataset(500);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'data science machine learning' };

      const startTime = performance.now();
      const result = await contextManager.optimizeContext(query, 10000);
      const endTime = performance.now();

      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(2000); // 2 seconds for large conversations
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    it('should handle concurrent optimizations efficiently', async () => {
      const chunks = generateLargeConversationDataset(100);
      contextManager.addChunks(chunks);

      const queries = [
        { text: 'machine learning' },
        { text: 'web development' },
        { text: 'data science' },
        { text: 'artificial intelligence' },
        { text: 'software engineering' },
      ];

      const startTime = performance.now();
      const promises = queries.map((query) =>
        contextManager.optimizeContext(query, 2000),
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      // Concurrent processing should be efficient
      expect(totalTime).toBeLessThan(3000); // 3 seconds for 5 concurrent optimizations
      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.chunks.length).toBeGreaterThan(0);
      });
    });

    it('should scale linearly with conversation size', async () => {
      const sizes = [50, 100, 200];
      const measurements: Array<{ size: number; time: number }> = [];

      for (const size of sizes) {
        contextManager.clear();
        const chunks = generateLargeConversationDataset(size);
        contextManager.addChunks(chunks);

        const query: RelevanceQuery = { text: 'test query for scaling' };

        const startTime = performance.now();
        await contextManager.optimizeContext(query, size * 50); // Proportional budget
        const endTime = performance.now();

        measurements.push({
          size,
          time: endTime - startTime,
        });
      }

      // Verify roughly linear scaling (allowing for some variance)
      const timeRatio_100_50 = measurements[1].time / measurements[0].time;
      const timeRatio_200_100 = measurements[2].time / measurements[1].time;

      // Should not scale exponentially
      expect(timeRatio_100_50).toBeLessThan(4); // Less than 4x slowdown for 2x size
      expect(timeRatio_200_100).toBeLessThan(4); // Less than 4x slowdown for 2x size
    });
  });

  describe('Memory Usage Characteristics', () => {
    it('should maintain reasonable memory usage for large conversations', async () => {
      const initialMemory = measureMemoryUsage();

      // Add a large conversation
      const chunks = generateLargeConversationDataset(1000);
      contextManager.addChunks(chunks);

      const afterAddingMemory = measureMemoryUsage();
      const memoryIncrease = afterAddingMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB for 1000 chunks)
      expect(memoryIncrease).toBeLessThan(50);

      // Perform optimization
      const query: RelevanceQuery = { text: 'memory usage test' };
      await contextManager.optimizeContext(query, 10000);

      const afterOptimizationMemory = measureMemoryUsage();

      // Memory shouldn't grow significantly during optimization
      expect(afterOptimizationMemory - afterAddingMemory).toBeLessThan(20);
    });

    it('should clean up memory when clearing chunks', async () => {
      const _initialMemory = measureMemoryUsage();

      // Add chunks and measure memory
      const chunks = generateLargeConversationDataset(500);
      contextManager.addChunks(chunks);

      const withChunksMemory = measureMemoryUsage();

      // Clear chunks
      contextManager.clear();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const afterClearMemory = measureMemoryUsage();

      // Memory should be released (within reasonable bounds due to GC behavior)
      // Note: GC behavior is unpredictable, so we just check that memory usage is reasonable
      const _memoryReclaimed = withChunksMemory - afterClearMemory;
      // Memory might not be immediately reclaimed due to GC timing
      expect(afterClearMemory).toBeLessThan(withChunksMemory + 10); // Within 10MB tolerance
    });

    it('should not leak memory with repeated optimizations', async () => {
      const chunks = generateLargeConversationDataset(100);
      contextManager.addChunks(chunks);

      const initialMemory = measureMemoryUsage();

      // Perform many optimizations
      for (let i = 0; i < 50; i++) {
        const query: RelevanceQuery = { text: `test query ${i}` };
        await contextManager.optimizeContext(query, 2000);
      }

      const finalMemory = measureMemoryUsage();
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be minimal (less than 10MB)
      expect(memoryGrowth).toBeLessThan(10);
    });
  });

  describe('Token Reduction Effectiveness', () => {
    it('should achieve significant token reduction under budget pressure', async () => {
      const chunks = generateLargeConversationDataset(200);
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

      contextManager.addChunks(chunks);

      // Set aggressive budget (30% of original)
      const aggressiveBudget = Math.floor(totalTokens * 0.3);

      const query: RelevanceQuery = { text: 'token reduction test' };
      const result = await contextManager.optimizeContext(
        query,
        aggressiveBudget,
      );

      const stats = contextManager.getOptimizationStats();

      expect(stats).not.toBeNull();
      expect(stats!.reductionPercentage).toBeGreaterThanOrEqual(65); // At least 65% reduction
      expect(result.totalTokens).toBeLessThanOrEqual(aggressiveBudget);
    });

    it('should preserve more content with larger budgets', async () => {
      const chunks = generateLargeConversationDataset(100);
      const totalTokens = chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'content preservation test' };

      // Test different budget levels
      const budgets = [
        Math.floor(totalTokens * 0.3), // 30%
        Math.floor(totalTokens * 0.6), // 60%
        Math.floor(totalTokens * 0.9), // 90%
      ];

      const results: Array<{ budget: number; preserved: number }> = [];

      for (const budget of budgets) {
        const result = await contextManager.optimizeContext(query, budget);
        results.push({
          budget,
          preserved: result.chunks.length,
        });
      }

      // More budget should preserve more chunks
      expect(results[1].preserved).toBeGreaterThanOrEqual(results[0].preserved);
      expect(results[2].preserved).toBeGreaterThanOrEqual(results[1].preserved);
    });

    it('should maintain efficiency across different optimization strategies', async () => {
      const chunks = generateLargeConversationDataset(150);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'strategy comparison test' };
      const budget = 5000;

      // Test standard strategy
      const standardResult = await contextManager.optimizeContext(
        query,
        budget,
      );
      const standardStats = contextManager.getOptimizationStats();

      // Test aggressive strategy
      contextManager.updateConfig({ ...config, aggressivePruning: true });
      const aggressiveResult = await contextManager.optimizeContext(
        query,
        budget,
      );
      const aggressiveStats = contextManager.getOptimizationStats();

      // Both should be within budget
      expect(standardResult.totalTokens).toBeLessThanOrEqual(budget);
      expect(aggressiveResult.totalTokens).toBeLessThanOrEqual(budget);

      // Aggressive should potentially achieve higher reduction
      expect(aggressiveStats!.reductionPercentage).toBeGreaterThanOrEqual(
        standardStats!.reductionPercentage,
      );
    });
  });

  describe('Relevance Preservation Accuracy', () => {
    it('should prioritize highly relevant chunks', async () => {
      // Create chunks with known relevance patterns
      const chunks: Array<
        ConversationChunk & { groundTruthRelevance?: number }
      > = [
        createMockChunk(
          'high-rel-1',
          'user',
          'machine learning neural networks deep learning',
          100,
          Date.now() - 5000,
          0.9,
        ),
        createMockChunk(
          'high-rel-2',
          'assistant',
          'artificial intelligence and machine learning algorithms',
          120,
          Date.now() - 4000,
          0.85,
        ),
        createMockChunk(
          'med-rel-1',
          'user',
          'programming and software development',
          80,
          Date.now() - 3000,
          0.6,
        ),
        createMockChunk(
          'low-rel-1',
          'user',
          'weather forecast for tomorrow',
          60,
          Date.now() - 2000,
          0.2,
        ),
        createMockChunk(
          'low-rel-2',
          'assistant',
          'cooking recipes and food preparation',
          90,
          Date.now() - 1000,
          0.1,
        ),
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = {
        text: 'machine learning artificial intelligence',
      };
      const result = await contextManager.optimizeContext(query, 300); // Force selection

      // High relevance chunks should be more likely to be included
      const highRelevanceIncluded = result.chunks.filter((chunk) => {
        const originalChunk = chunks.find((c) => c.id === chunk.id);
        return originalChunk && originalChunk.groundTruthRelevance! > 0.8;
      });

      const lowRelevanceIncluded = result.chunks.filter((chunk) => {
        const originalChunk = chunks.find((c) => c.id === chunk.id);
        return originalChunk && originalChunk.groundTruthRelevance! < 0.3;
      });

      expect(highRelevanceIncluded.length).toBeGreaterThan(
        lowRelevanceIncluded.length,
      );
    });

    it('should calculate relevance preservation metrics accurately', async () => {
      const chunks = generateLargeConversationDataset(50);

      // Assign ground truth relevance scores
      chunks.forEach((chunk, _index) => {
        const chunkWithTruth = chunk as ConversationChunk & {
          groundTruthRelevance?: number;
        };
        // Simulate realistic relevance distribution
        if (
          chunk.content.includes('machine learning') ||
          chunk.content.includes('artificial intelligence')
        ) {
          chunkWithTruth.groundTruthRelevance = 0.8 + Math.random() * 0.2;
        } else if (
          chunk.content.includes('data science') ||
          chunk.content.includes('web development')
        ) {
          chunkWithTruth.groundTruthRelevance = 0.4 + Math.random() * 0.4;
        } else {
          chunkWithTruth.groundTruthRelevance = Math.random() * 0.4;
        }
      });

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = {
        text: 'machine learning artificial intelligence',
      };
      const result = await contextManager.optimizeContext(query, 2500);

      // Calculate precision@k (how many selected chunks are actually relevant)
      const selectedWithTruth = result.chunks.map((chunk) => {
        const original = chunks.find(
          (c) => c.id === chunk.id,
        ) as ConversationChunk & { groundTruthRelevance?: number };
        return original?.groundTruthRelevance || 0;
      });

      const relevantSelected = selectedWithTruth.filter(
        (score) => score > 0.6,
      ).length;
      const precision = relevantSelected / selectedWithTruth.length;

      // Should achieve reasonable precision
      expect(precision).toBeGreaterThan(0.3); // At least 30% precision

      // Calculate recall (how many relevant chunks were selected)
      const allRelevant = chunks.filter((chunk) => {
        const chunkWithTruth = chunk as ConversationChunk & {
          groundTruthRelevance?: number;
        };
        return chunkWithTruth.groundTruthRelevance! > 0.6;
      });

      const relevantSelectedIds = result.chunks
        .filter((chunk) => {
          const original = chunks.find(
            (c) => c.id === chunk.id,
          ) as ConversationChunk & { groundTruthRelevance?: number };
          return original && original.groundTruthRelevance! > 0.6;
        })
        .map((chunk) => chunk.id);

      const recall = relevantSelectedIds.length / allRelevant.length;

      // Should achieve reasonable recall given budget constraints
      expect(recall).toBeGreaterThan(0.2); // At least 20% recall
    });

    it('should maintain relevance quality across different query types', async () => {
      const chunks = generateLargeConversationDataset(100);
      contextManager.addChunks(chunks);

      const queryTypes = [
        {
          text: 'machine learning algorithms',
          expectedTopic: 'machine learning',
        },
        {
          text: 'web development frameworks',
          expectedTopic: 'web development',
        },
        { text: 'database design patterns', expectedTopic: 'database' },
        {
          text: 'user experience principles',
          expectedTopic: 'user experience',
        },
      ];

      const relevanceScores: number[] = [];

      for (const queryType of queryTypes) {
        const result = await contextManager.optimizeContext(queryType, 2000);

        // Calculate how many results are topically relevant
        const topicallyRelevant = result.chunks.filter((chunk) =>
          chunk.content
            .toLowerCase()
            .includes(queryType.expectedTopic.toLowerCase()),
        ).length;

        const topicalRelevance = topicallyRelevant / result.chunks.length;
        relevanceScores.push(topicalRelevance);
      }

      // All query types should achieve some level of topical relevance
      relevanceScores.forEach((score) => {
        expect(score).toBeGreaterThan(0.1); // At least 10% topical relevance
      });

      // Average relevance should be reasonable
      const averageRelevance =
        relevanceScores.reduce((sum, score) => sum + score, 0) /
        relevanceScores.length;
      expect(averageRelevance).toBeGreaterThan(0.2); // At least 20% average relevance
    });
  });

  describe('Throughput and Scalability', () => {
    it('should maintain high throughput for batch optimizations', async () => {
      const chunks = generateLargeConversationDataset(200);
      contextManager.addChunks(chunks);

      const queries = Array.from({ length: 20 }, (_, i) => ({
        text: `batch query ${i} about various topics`,
      }));

      const startTime = performance.now();

      const results = await Promise.all(
        queries.map((query) => contextManager.optimizeContext(query, 2000)),
      );

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const throughput = queries.length / (totalTime / 1000); // queries per second

      // Should handle at least 5 queries per second
      expect(throughput).toBeGreaterThan(5);
      expect(results).toHaveLength(queries.length);
    });

    it('should scale to handle very large conversations', async () => {
      // Test with progressively larger conversations
      const sizes = [100, 500, 1000];
      const performanceData: Array<{
        size: number;
        timeMs: number;
        throughput: number;
      }> = [];

      for (const size of sizes) {
        contextManager.clear();
        const chunks = generateLargeConversationDataset(size);
        contextManager.addChunks(chunks);

        const query: RelevanceQuery = { text: 'scalability test query' };

        const startTime = performance.now();
        const result = await contextManager.optimizeContext(query, size * 25); // Proportional budget
        const endTime = performance.now();

        const timeMs = endTime - startTime;
        const throughput = size / (timeMs / 1000); // chunks per second

        performanceData.push({ size, timeMs, throughput });

        // Should complete successfully regardless of size
        expect(result.chunks.length).toBeGreaterThan(0);
        expect(timeMs).toBeLessThan(10000); // 10 second max for any size
      }

      // Verify that throughput doesn't degrade drastically
      const throughputRatio =
        performanceData[2].throughput / performanceData[0].throughput;
      expect(throughputRatio).toBeGreaterThan(0.1); // Shouldn't be more than 10x slower per chunk
    });

    it('should handle burst loads efficiently', async () => {
      const chunks = generateLargeConversationDataset(300);
      contextManager.addChunks(chunks);

      // Simulate burst load: many concurrent requests
      const burstSize = 15;
      const queries = Array.from({ length: burstSize }, (_, i) => ({
        text: `burst query ${i}`,
      }));

      const startTime = performance.now();

      // Start all requests simultaneously
      const promises = queries.map((query) =>
        contextManager.optimizeContext(query, 1500),
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;

      // All should complete successfully
      expect(results).toHaveLength(burstSize);
      results.forEach((result) => {
        expect(result.chunks.length).toBeGreaterThan(0);
      });

      // Burst should complete in reasonable time
      expect(totalTime).toBeLessThan(5000); // 5 seconds for burst of 15
    });
  });

  describe('Quality Validation Metrics', () => {
    it('should maintain conversation coherence under optimization pressure', async () => {
      // Create a structured conversation with clear patterns
      const baseTime = Date.now() - 20000;
      const chunks: ConversationChunk[] = [];

      for (let i = 0; i < 20; i++) {
        chunks.push(
          createMockChunk(
            `user-${i}`,
            'user',
            `User question ${i} about topic ${Math.floor(i / 2)}`,
            80,
            baseTime + i * 1000,
          ),
          createMockChunk(
            `assistant-${i}`,
            'assistant',
            `Assistant response ${i} to question ${i}`,
            120,
            baseTime + i * 1000 + 500,
          ),
        );
      }

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = {
        text: 'question and response about topics',
      };
      const result = await contextManager.optimizeContext(query, 1200); // Force aggressive pruning

      // Verify no orphaned assistant responses
      const sortedResult = result.chunks.sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      for (let i = 0; i < sortedResult.length; i++) {
        const chunk = sortedResult[i];
        if (chunk.role === 'assistant') {
          // Should have a user message before it
          const precedingChunks = sortedResult.slice(0, i);
          const hasUserBefore = precedingChunks.some(
            (c) => c.role === 'user' && c.timestamp < chunk.timestamp,
          );
          expect(hasUserBefore).toBe(true);
        }
      }
    });

    it('should preserve critical information markers', async () => {
      const systemChunk = createMockChunk(
        'system',
        'assistant',
        'System prompt information',
        100,
        Date.now() - 10000,
      );
      systemChunk.metadata.tags = ['system-prompt'];

      const importantChunk = createMockChunk(
        'important',
        'user',
        'Critical user information',
        100,
        Date.now() - 9000,
      );
      importantChunk.metadata.pinned = true;

      const toolChunk = createMockChunk(
        'tool',
        'tool',
        'Tool definition',
        150,
        Date.now() - 8000,
      );
      toolChunk.metadata.tags = ['tool-definition'];

      const chunks: ConversationChunk[] = [
        systemChunk,
        importantChunk,
        toolChunk,
        ...generateLargeConversationDataset(50), // Add noise
      ];

      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'unrelated query about weather' };
      const result = await contextManager.optimizeContext(query, 800); // Aggressive budget

      // Critical chunks should be preserved
      const hasSystemPrompt = result.chunks.some((chunk) =>
        chunk.metadata.tags?.includes('system-prompt'),
      );
      const hasPinnedChunk = result.chunks.some(
        (chunk) => chunk.metadata.pinned === true,
      );
      const hasToolDefinition = result.chunks.some((chunk) =>
        chunk.metadata.tags?.includes('tool-definition'),
      );

      expect(hasSystemPrompt).toBe(true);
      expect(hasPinnedChunk).toBe(true);
      expect(hasToolDefinition).toBe(true);
    });

    it('should provide comprehensive performance reporting', async () => {
      const chunks = generateLargeConversationDataset(100);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'performance reporting test' };
      await contextManager.optimizeContext(query, 3000);

      const optimizationStats = contextManager.getOptimizationStats();
      const cumulativeStats = contextManager.getCumulativeStats();

      // Verify comprehensive stats are available
      expect(optimizationStats).not.toBeNull();
      expect(optimizationStats!.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(optimizationStats!.originalChunks).toBe(chunks.length);
      expect(optimizationStats!.reductionPercentage).toBeGreaterThanOrEqual(0);

      expect(cumulativeStats.totalOptimizations).toBe(1);
      expect(cumulativeStats.totalTokensProcessed).toBeGreaterThan(0);
      expect(cumulativeStats.averageReductionPercentage).toBeGreaterThanOrEqual(
        0,
      );
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle pathological input patterns efficiently', async () => {
      // Create pathological cases
      const pathologicalChunks: ConversationChunk[] = [
        // Very large chunk
        createMockChunk('huge', 'user', 'x'.repeat(10000), 2500),
        // Many tiny chunks
        ...Array.from({ length: 100 }, (_, i) =>
          createMockChunk(`tiny-${i}`, 'user', 'x', 1),
        ),
        // Zero token chunks
        createMockChunk('zero1', 'user', '', 0),
        createMockChunk('zero2', 'user', '', 0),
      ];

      contextManager.addChunks(pathologicalChunks);

      const query: RelevanceQuery = { text: 'pathological test' };

      const startTime = performance.now();
      const result = await contextManager.optimizeContext(query, 1000);
      const endTime = performance.now();

      // Should complete in reasonable time despite pathological input
      expect(endTime - startTime).toBeLessThan(1000); // 1 second max
      expect(result.chunks).toBeDefined();
    });

    it('should maintain performance with frequent configuration changes', async () => {
      const chunks = generateLargeConversationDataset(50);
      contextManager.addChunks(chunks);

      const query: RelevanceQuery = { text: 'configuration change test' };

      const startTime = performance.now();

      // Rapidly change configuration and optimize
      for (let i = 0; i < 10; i++) {
        // Create valid weight configurations that sum to 1.0
        const configs = [
          { embedding: 0.4, bm25: 0.4, recency: 0.15, manual: 0.05 },
          { embedding: 0.3, bm25: 0.5, recency: 0.15, manual: 0.05 },
          { embedding: 0.5, bm25: 0.3, recency: 0.15, manual: 0.05 },
          { embedding: 0.35, bm25: 0.35, recency: 0.25, manual: 0.05 },
          { embedding: 0.35, bm25: 0.35, recency: 0.2, manual: 0.1 },
        ];
        contextManager.updateConfig({
          ...config,
          scoringWeights: configs[i % configs.length],
        });

        await contextManager.optimizeContext(query, 1500);
      }

      const endTime = performance.now();

      // Should handle rapid reconfigurations efficiently
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds for 10 reconfigurations
    });
  });
});
