/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChunkRegistry } from './ChunkRegistry.js';
import { ContextPruner } from './ContextPruner.js';
import { HybridScorer } from './scoring/HybridScorer.js';
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
  private lastOptimizationStats: PruningStats | null = null;
  private cumulativeStats: CumulativeOptimizationStats;

  constructor(config?: ContextOptimizationConfig) {
    this.config = this.validateAndSanitizeConfig(config || this.getDefaultConfig());
    this.chunkRegistry = new ChunkRegistry();
    this.contextPruner = new ContextPruner();
    this.hybridScorer = new HybridScorer(this.config.scoringWeights);
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
    chunks.forEach(chunk => this.chunkRegistry.addChunk(chunk));
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
   * Optimize context using the complete workflow:
   * 1. Retrieve all chunks from registry
   * 2. Score chunks using HybridScorer
   * 3. Update chunks with scores in registry
   * 4. Prune chunks using ContextPruner
   * 5. Return optimized context window
   */
  async optimizeContext(query: RelevanceQuery, tokenBudget: number): Promise<ContextWindow> {
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

    try {
      // Step 1: Score all chunks
      const scoringResults = await this.scoreChunks(chunks, query);
      
      // Step 2: Update chunks with scores in registry
      this.updateChunksWithScores(chunks, scoringResults);
      
      // Step 3: Get updated chunks with scores for pruning
      const scoredChunks = this.chunkRegistry.getAllChunks();
      
      // Step 4: Prune chunks using optimization strategy
      const pruningResult = this.contextPruner.pruneChunks(scoredChunks, query, tokenBudget);
      
      // Step 5: Track statistics
      this.lastOptimizationStats = pruningResult.stats;
      this.updateCumulativeStats(pruningResult.stats);
      
      return {
        chunks: pruningResult.prunedChunks,
        totalTokens: pruningResult.prunedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
        maxTokens: tokenBudget,
      };
      
    } catch (error) {
      // Fallback: proceed with pruning without scoring
      const pruningResult = this.contextPruner.pruneChunks(chunks, query, tokenBudget);
      
      this.lastOptimizationStats = pruningResult.stats;
      this.updateCumulativeStats(pruningResult.stats);
      
      return {
        chunks: pruningResult.prunedChunks,
        totalTokens: pruningResult.prunedChunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
        maxTokens: tokenBudget,
      };
    }
  }

  /**
   * Get statistics from the last optimization run.
   */
  getOptimizationStats(): PruningStats | null {
    return this.lastOptimizationStats ? { ...this.lastOptimizationStats } : null;
  }

  /**
   * Get cumulative statistics across all optimization runs.
   */
  getCumulativeStats(): CumulativeOptimizationStats {
    return { ...this.cumulativeStats };
  }

  /**
   * Score chunks using the hybrid scoring system.
   */
  private async scoreChunks(chunks: ConversationChunk[], query: RelevanceQuery): Promise<ScoringResult[]> {
    return await this.hybridScorer.scoreChunks(chunks, query);
  }

  /**
   * Update chunks in registry with their calculated scores.
   */
  private updateChunksWithScores(chunks: ConversationChunk[], scoringResults: ScoringResult[]): void {
    const scoreMap = new Map(scoringResults.map(result => [result.chunkId, result]));
    
    chunks.forEach(chunk => {
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
    const totalTokensProcessed = this.cumulativeStats.totalTokensProcessed + stats.originalTokens;
    const totalTokensSaved = this.cumulativeStats.totalTokensSaved + (stats.originalTokens - stats.prunedTokens);
    const totalProcessingTimeMs = this.cumulativeStats.totalProcessingTimeMs + stats.processingTimeMs;
    
    // Calculate weighted average reduction percentage
    const averageReductionPercentage = totalOptimizations > 0 
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
  private validateAndSanitizeConfig(config: ContextOptimizationConfig): ContextOptimizationConfig {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('Configuration validation failed: enabled must be a boolean');
    }
    
    if (typeof config.maxChunks !== 'number' || config.maxChunks < 0) {
      throw new Error('Configuration validation failed: maxChunks must be a non-negative number');
    }
    
    if (typeof config.embeddingEnabled !== 'boolean') {
      throw new Error('Configuration validation failed: embeddingEnabled must be a boolean');
    }
    
    if (typeof config.aggressivePruning !== 'boolean') {
      throw new Error('Configuration validation failed: aggressivePruning must be a boolean');
    }
    
    if (!config.scoringWeights || typeof config.scoringWeights !== 'object') {
      throw new Error('Configuration validation failed: scoringWeights must be an object');
    }
    
    const { embedding, bm25, recency, manual } = config.scoringWeights;
    
    if (typeof embedding !== 'number' || embedding < 0 || embedding > 1) {
      throw new Error('Configuration validation failed: embedding weight must be a number between 0 and 1');
    }
    
    if (typeof bm25 !== 'number' || bm25 < 0 || bm25 > 1) {
      throw new Error('Configuration validation failed: bm25 weight must be a number between 0 and 1');
    }
    
    if (typeof recency !== 'number' || recency < 0 || recency > 1) {
      throw new Error('Configuration validation failed: recency weight must be a number between 0 and 1');
    }
    
    if (typeof manual !== 'number' || manual < 0 || manual > 1) {
      throw new Error('Configuration validation failed: manual weight must be a number between 0 and 1');
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
}