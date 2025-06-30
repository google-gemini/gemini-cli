/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChunkRegistry } from './ChunkRegistry.js';
import { ContextPruner } from './ContextPruner.js';
import { HybridScorer } from './scoring/HybridScorer.js';
import { ContextLogger, type OptimizationLogEntry } from './ContextLogger.js';
import { FallbackStrategyManager } from './FallbackStrategies.js';
import type {
  ConversationChunk,
  ContextOptimizationConfig,
  RelevanceQuery,
  ContextWindow,
  PruningStats,
  ScoringResult,
} from './types.js';

/**
 * Cumulative statistics tracking multiple optimization runs.
 */
export interface CumulativeOptimizationStats {
  totalOptimizations: number;
  totalTokensProcessed: number;
  totalTokensSaved: number;
  averageReductionPercentage: number;
  totalProcessingTimeMs: number;
}

/**
 * Central orchestrator for the context optimization system.
 * Manages ChunkRegistry, HybridScorer, and ContextPruner to provide
 * a high-level API for context optimization workflows.
 */
export class ContextManager {
  private config: ContextOptimizationConfig;
  private chunkRegistry: ChunkRegistry;
  private contextPruner: ContextPruner;
  private hybridScorer: HybridScorer;
  private logger: ContextLogger;
  private fallbackManager: FallbackStrategyManager;
  private lastOptimizationStats: PruningStats | null = null;
  private cumulativeStats: CumulativeOptimizationStats;

  constructor(
    config?: ContextOptimizationConfig,
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
  ) {
    this.config = this.validateAndSanitizeConfig(
      config || this.getDefaultConfig(),
    );
    this.chunkRegistry = new ChunkRegistry();
    this.contextPruner = new ContextPruner();
    this.hybridScorer = new HybridScorer(this.config.scoringWeights);
    this.logger = new ContextLogger(logLevel);
    this.fallbackManager = new FallbackStrategyManager();
    this.cumulativeStats = this.initializeCumulativeStats();
  }

  /**
   * Get the current configuration.
   */
  getConfig(): ContextOptimizationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(newConfig: ContextOptimizationConfig): void {
    const validatedConfig = this.validateAndSanitizeConfig(newConfig);
    this.config = validatedConfig;

    // Update scorer weights if they changed
    this.hybridScorer.updateWeights(this.config.scoringWeights);
  }

  /**
   * Add a single chunk to the registry.
   */
  addChunk(chunk: ConversationChunk): void {
    this.chunkRegistry.addChunk(chunk);
  }

  /**
   * Add multiple chunks to the registry.
   */
  addChunks(chunks: ConversationChunk[]): void {
    chunks.forEach((chunk) => this.chunkRegistry.addChunk(chunk));
  }

  /**
   * Retrieve a chunk by ID.
   */
  getChunk(id: string): ConversationChunk | undefined {
    return this.chunkRegistry.getChunk(id);
  }

  /**
   * Remove a chunk by ID.
   */
  removeChunk(id: string): boolean {
    return this.chunkRegistry.removeChunk(id);
  }

  /**
   * Clear all chunks and reset statistics.
   */
  clear(): void {
    this.chunkRegistry.clear();
    this.lastOptimizationStats = null;
    this.cumulativeStats = this.initializeCumulativeStats();
  }

  /**
   * Get total token count across all chunks.
   */
  getTotalTokens(): number {
    return this.chunkRegistry.getTotalTokens();
  }

  /**
   * Optimize context using the complete workflow with robust fallback hierarchy:
   * 1. Primary: Full hybrid scoring workflow
   * 2. Fallback 1: Recency-based deterministic scoring
   * 3. Fallback 2: Simple chronological truncation
   * Always preserves mandatory chunks (system prompt, pinned memories)
   */
  async optimizeContext(
    query: RelevanceQuery,
    tokenBudget: number,
  ): Promise<ContextWindow> {
    const startTime = Date.now();

    // Handle optimization disabled
    if (!this.config.enabled) {
      return this.createUnoptimizedContext(tokenBudget);
    }

    // Handle edge cases
    if (tokenBudget <= 0) {
      return {
        chunks: [],
        totalTokens: 0,
        maxTokens: tokenBudget,
      };
    }

    const chunks = this.chunkRegistry.getAllChunks();

    if (chunks.length === 0) {
      return {
        chunks: [],
        totalTokens: 0,
        maxTokens: tokenBudget,
      };
    }

    // Log optimization start
    this.logger.logOptimizationStart(query.text, chunks, tokenBudget);

    try {
      // PRIMARY: Full hybrid scoring workflow
      return await this.fullScoringWorkflow(
        chunks,
        query,
        tokenBudget,
        startTime,
      );
    } catch (scoringError) {
      this.logger.logError(scoringError as Error, 'primary scoring workflow', {
        query: query.text,
        chunksCount: chunks.length,
        tokenBudget,
      });

      try {
        // FALLBACK 1: Recency-based deterministic fallback
        this.logger.logOptimizationStart(
          query.text + ' [RECENCY-FALLBACK]',
          chunks,
          tokenBudget,
        );
        const fallbackResult = await this.fallbackManager.executeFallback(
          chunks,
          query,
          tokenBudget,
        );

        // Track fallback statistics
        const fallbackStats: PruningStats = {
          originalChunks: chunks.length,
          prunedChunks: fallbackResult.chunks.length,
          originalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
          prunedTokens: fallbackResult.totalTokens,
          reductionPercentage: Math.round(
            ((chunks.reduce((sum, chunk) => sum + chunk.tokens, 0) -
              fallbackResult.totalTokens) /
              chunks.reduce((sum, chunk) => sum + chunk.tokens, 0)) *
              100,
          ),
          processingTimeMs: Date.now() - startTime,
        };

        this.lastOptimizationStats = fallbackStats;
        this.updateCumulativeStats(fallbackStats);

        this.logger.logOptimizationComplete({
          query: query.text + ' [RECENCY-FALLBACK]',
          originalChunks: chunks.length,
          finalChunks: fallbackResult.chunks.length,
          originalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
          finalTokens: fallbackResult.totalTokens,
          reductionPercentage: fallbackStats.reductionPercentage,
          processingTimeMs: fallbackStats.processingTimeMs,
          scoringBreakdown: {
            bm25Average: 0,
            recencyAverage: 1,
            embeddingAverage: 0,
            hybridAverage: 0.5,
          },
          mandatoryChunks: chunks.filter(
            (chunk) =>
              chunk.metadata.pinned === true ||
              chunk.metadata.tags?.includes('system-prompt') ||
              chunk.metadata.tags?.includes('tool-definition'),
          ).length,
          prunedChunks: chunks
            .filter((c) => !fallbackResult.chunks.find((p) => p.id === c.id))
            .map((c) => c.id),
          topScoredChunks: [],
        });

        return fallbackResult;
      } catch (fallbackError) {
        this.logger.logError(fallbackError as Error, 'recency fallback', {
          query: query.text,
          chunksCount: chunks.length,
          tokenBudget,
        });

        // FALLBACK 2: Simple chronological truncation (ultimate fallback)
        const simpleTruncationResult = await this.simpleTruncationFallback(
          chunks,
          tokenBudget,
        );

        const ultimateStats: PruningStats = {
          originalChunks: chunks.length,
          prunedChunks: simpleTruncationResult.chunks.length,
          originalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
          prunedTokens: simpleTruncationResult.totalTokens,
          reductionPercentage: Math.round(
            ((chunks.reduce((sum, chunk) => sum + chunk.tokens, 0) -
              simpleTruncationResult.totalTokens) /
              chunks.reduce((sum, chunk) => sum + chunk.tokens, 0)) *
              100,
          ),
          processingTimeMs: Date.now() - startTime,
        };

        this.lastOptimizationStats = ultimateStats;
        this.updateCumulativeStats(ultimateStats);

        return simpleTruncationResult;
      }
    }
  }

  /**
   * Get statistics from the last optimization run.
   */
  getOptimizationStats(): PruningStats | null {
    return this.lastOptimizationStats
      ? { ...this.lastOptimizationStats }
      : null;
  }

  /**
   * Get cumulative statistics across all optimization runs.
   */
  getCumulativeStats(): CumulativeOptimizationStats {
    return { ...this.cumulativeStats };
  }

  /**
   * Execute the full scoring workflow (primary path).
   */
  private async fullScoringWorkflow(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    tokenBudget: number,
    startTime: number,
  ): Promise<ContextWindow> {
    // Step 1: Score all chunks
    const scoringStartTime = Date.now();
    const scoringResults = await this.scoreChunks(chunks, query);
    const scoringTime = Date.now() - scoringStartTime;

    // Log scoring completion
    this.logger.logScoringComplete(scoringResults, scoringTime);

    // Step 2: Update chunks with scores in registry
    this.updateChunksWithScores(chunks, scoringResults);

    // Step 3: Get updated chunks with scores for pruning
    const scoredChunks = this.chunkRegistry.getAllChunks();

    // Step 4: Prune chunks using optimization strategy
    const pruningResult = this.contextPruner.pruneChunks(
      scoredChunks,
      query,
      tokenBudget,
    );

    // Count mandatory chunks
    const mandatoryCount = scoredChunks.filter(
      (chunk) =>
        chunk.metadata.pinned === true ||
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition'),
    ).length;

    // Log pruning completion
    this.logger.logPruningComplete(
      pruningResult.stats,
      mandatoryCount,
      pruningResult.prunedChunks,
    );

    // Step 5: Track statistics
    this.lastOptimizationStats = pruningResult.stats;
    this.updateCumulativeStats(pruningResult.stats);

    // Create comprehensive log entry
    const totalTime = Date.now() - startTime;
    const logEntry: OptimizationLogEntry = {
      query: query.text,
      originalChunks: chunks.length,
      finalChunks: pruningResult.prunedChunks.length,
      originalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
      finalTokens: pruningResult.prunedChunks.reduce(
        (sum, chunk) => sum + chunk.tokens,
        0,
      ),
      reductionPercentage: pruningResult.stats.reductionPercentage,
      processingTimeMs: totalTime,
      scoringBreakdown: this.calculateScoringBreakdown(scoringResults),
      mandatoryChunks: mandatoryCount,
      prunedChunks: chunks
        .filter((c) => !pruningResult.prunedChunks.find((p) => p.id === c.id))
        .map((c) => c.id),
      topScoredChunks: scoringResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((r) => ({
          id: r.chunkId,
          score: r.score,
          tokens: chunks.find((c) => c.id === r.chunkId)?.tokens || 0,
        })),
    };

    // Log complete optimization
    this.logger.logOptimizationComplete(logEntry);

    return {
      chunks: pruningResult.prunedChunks,
      totalTokens: pruningResult.prunedChunks.reduce(
        (sum, chunk) => sum + chunk.tokens,
        0,
      ),
      maxTokens: tokenBudget,
    };
  }

  /**
   * Simple truncation fallback (ultimate fallback).
   */
  private async simpleTruncationFallback(
    chunks: ConversationChunk[],
    tokenBudget: number,
  ): Promise<ContextWindow> {
    // Separate mandatory and optional chunks
    const mandatoryChunks: ConversationChunk[] = [];
    const optionalChunks: ConversationChunk[] = [];

    chunks.forEach((chunk) => {
      if (
        chunk.metadata.pinned === true ||
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition')
      ) {
        mandatoryChunks.push(chunk);
      } else {
        optionalChunks.push(chunk);
      }
    });

    // Always include mandatory chunks
    let totalTokens = mandatoryChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );
    const selectedChunks = [...mandatoryChunks];

    // Add optional chunks chronologically (most recent first) until budget exhausted
    optionalChunks.sort((a, b) => b.timestamp - a.timestamp);

    for (const chunk of optionalChunks) {
      if (totalTokens + chunk.tokens <= tokenBudget) {
        selectedChunks.push(chunk);
        totalTokens += chunk.tokens;
      }
    }

    // Restore chronological order for final output
    selectedChunks.sort((a, b) => a.timestamp - b.timestamp);

    return {
      chunks: selectedChunks,
      totalTokens,
      maxTokens: tokenBudget,
    };
  }

  /**
   * Score chunks using the hybrid scoring system.
   */
  private async scoreChunks(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
  ): Promise<ScoringResult[]> {
    return await this.hybridScorer.scoreChunks(chunks, query);
  }

  /**
   * Update chunks in registry with their calculated scores.
   */
  private updateChunksWithScores(
    chunks: ConversationChunk[],
    scoringResults: ScoringResult[],
  ): void {
    const scoreMap = new Map(
      scoringResults.map((result) => [result.chunkId, result]),
    );

    chunks.forEach((chunk) => {
      const scoringResult = scoreMap.get(chunk.id);
      if (scoringResult) {
        const updatedChunk: ConversationChunk = {
          ...chunk,
          metadata: {
            ...chunk.metadata,
            finalScore: scoringResult.score,
            // Store breakdown scores for debugging/analysis
            bm25Score: scoringResult.breakdown.bm25,
            embeddingScore: scoringResult.breakdown.embedding,
            recencyScore: scoringResult.breakdown.recency,
          },
        };

        this.chunkRegistry.addChunk(updatedChunk);
      }
    });
  }

  /**
   * Create unoptimized context window when optimization is disabled.
   */
  private createUnoptimizedContext(tokenBudget: number): ContextWindow {
    const chunks = this.chunkRegistry.getAllChunks();
    const totalTokens = this.chunkRegistry.getTotalTokens();

    return {
      chunks,
      totalTokens,
      maxTokens: tokenBudget,
    };
  }

  /**
   * Update cumulative statistics with results from latest optimization.
   */
  private updateCumulativeStats(stats: PruningStats): void {
    const totalOptimizations = this.cumulativeStats.totalOptimizations + 1;
    const totalTokensProcessed =
      this.cumulativeStats.totalTokensProcessed + stats.originalTokens;
    const totalTokensSaved =
      this.cumulativeStats.totalTokensSaved +
      (stats.originalTokens - stats.prunedTokens);
    const totalProcessingTimeMs =
      this.cumulativeStats.totalProcessingTimeMs + stats.processingTimeMs;

    // Calculate weighted average reduction percentage
    const averageReductionPercentage =
      totalOptimizations > 0
        ? Math.round((totalTokensSaved / totalTokensProcessed) * 100)
        : 0;

    this.cumulativeStats = {
      totalOptimizations,
      totalTokensProcessed,
      totalTokensSaved,
      averageReductionPercentage,
      totalProcessingTimeMs,
    };
  }

  /**
   * Get default configuration.
   */
  private getDefaultConfig(): ContextOptimizationConfig {
    return {
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
  }

  /**
   * Validate and sanitize configuration.
   */
  private validateAndSanitizeConfig(
    config: ContextOptimizationConfig,
  ): ContextOptimizationConfig {
    if (typeof config.enabled !== 'boolean') {
      throw new Error(
        'Configuration validation failed: enabled must be a boolean',
      );
    }

    if (typeof config.maxChunks !== 'number' || config.maxChunks < 0) {
      throw new Error(
        'Configuration validation failed: maxChunks must be a non-negative number',
      );
    }

    if (typeof config.embeddingEnabled !== 'boolean') {
      throw new Error(
        'Configuration validation failed: embeddingEnabled must be a boolean',
      );
    }

    if (typeof config.aggressivePruning !== 'boolean') {
      throw new Error(
        'Configuration validation failed: aggressivePruning must be a boolean',
      );
    }

    if (!config.scoringWeights || typeof config.scoringWeights !== 'object') {
      throw new Error(
        'Configuration validation failed: scoringWeights must be an object',
      );
    }

    const { embedding, bm25, recency, manual } = config.scoringWeights;

    if (typeof embedding !== 'number' || embedding < 0 || embedding > 1) {
      throw new Error(
        'Configuration validation failed: embedding weight must be a number between 0 and 1',
      );
    }

    if (typeof bm25 !== 'number' || bm25 < 0 || bm25 > 1) {
      throw new Error(
        'Configuration validation failed: bm25 weight must be a number between 0 and 1',
      );
    }

    if (typeof recency !== 'number' || recency < 0 || recency > 1) {
      throw new Error(
        'Configuration validation failed: recency weight must be a number between 0 and 1',
      );
    }

    if (typeof manual !== 'number' || manual < 0 || manual > 1) {
      throw new Error(
        'Configuration validation failed: manual weight must be a number between 0 and 1',
      );
    }

    // Critical enhancement: Validate that scoring weights sum to 1.0
    const totalWeight = embedding + bm25 + recency + manual;

    // Use epsilon for floating point comparison to handle precision issues
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(
        `Configuration validation failed: scoringWeights must sum to 1.0, but sum to ${totalWeight.toFixed(6)}. ` +
          `Current weights: embedding=${embedding}, bm25=${bm25}, recency=${recency}, manual=${manual}`,
      );
    }

    return { ...config };
  }

  /**
   * Initialize cumulative statistics.
   */
  private initializeCumulativeStats(): CumulativeOptimizationStats {
    return {
      totalOptimizations: 0,
      totalTokensProcessed: 0,
      totalTokensSaved: 0,
      averageReductionPercentage: 0,
      totalProcessingTimeMs: 0,
    };
  }

  /**
   * Calculate scoring breakdown from scoring results.
   */
  private calculateScoringBreakdown(results: ScoringResult[]): {
    bm25Average: number;
    recencyAverage: number;
    embeddingAverage: number;
    hybridAverage: number;
  } {
    if (results.length === 0) {
      return {
        bm25Average: 0,
        recencyAverage: 0,
        embeddingAverage: 0,
        hybridAverage: 0,
      };
    }

    const totals = results.reduce(
      (acc, result) => ({
        bm25: acc.bm25 + (result.breakdown.bm25 || 0),
        recency: acc.recency + (result.breakdown.recency || 0),
        embedding: acc.embedding + (result.breakdown.embedding || 0),
        hybrid: acc.hybrid + result.score,
      }),
      { bm25: 0, recency: 0, embedding: 0, hybrid: 0 },
    );

    return {
      bm25Average: totals.bm25 / results.length,
      recencyAverage: totals.recency / results.length,
      embeddingAverage: totals.embedding / results.length,
      hybridAverage: totals.hybrid / results.length,
    };
  }

  /**
   * Get the context logger for external monitoring.
   */
  getLogger(): ContextLogger {
    return this.logger;
  }

  /**
   * Get performance summary from the logger.
   */
  getPerformanceSummary() {
    return this.logger.getPerformanceSummary();
  }

  /**
   * Get recent optimization logs.
   */
  getRecentOptimizations(count = 10): OptimizationLogEntry[] {
    return this.logger.getRecentStats(count);
  }

  /**
   * Set logging level.
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logger.setLogLevel(level);
  }

  /**
   * Export all optimization logs for analysis.
   */
  exportOptimizationLogs() {
    return this.logger.exportLogs();
  }

  /**
   * Clear optimization logs.
   */
  clearOptimizationLogs(): void {
    this.logger.clearLogs();
  }
}
