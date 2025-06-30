/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk, PruningStats, ScoringResult } from './types.js';

export interface ContextOptimizationEvent {
  timestamp: number;
  type: 'optimization_start' | 'optimization_complete' | 'scoring_complete' | 'pruning_complete' | 'error';
  data: Record<string, unknown>;
}

export interface OptimizationLogEntry {
  query: string;
  originalChunks: number;
  finalChunks: number;
  originalTokens: number;
  finalTokens: number;
  reductionPercentage: number;
  processingTimeMs: number;
  scoringBreakdown: {
    bm25Average: number;
    recencyAverage: number;
    embeddingAverage: number;
    hybridAverage: number;
  };
  mandatoryChunks: number;
  prunedChunks: string[];
  topScoredChunks: Array<{ id: string; score: number; tokens: number }>;
}

/**
 * Logger for context optimization operations with detailed telemetry.
 */
export class ContextLogger {
  private events: ContextOptimizationEvent[] = [];
  private maxEvents = 1000;
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  /**
   * Log optimization start event.
   */
  logOptimizationStart(query: string, chunks: ConversationChunk[], maxTokens: number): void {
    const event: ContextOptimizationEvent = {
      timestamp: Date.now(),
      type: 'optimization_start',
      data: {
        query: this.truncateString(query, 100),
        chunksCount: chunks.length,
        totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
        maxTokens,
        chunkTypes: this.getChunkTypeBreakdown(chunks),
      },
    };

    this.addEvent(event);
    
    if (this.shouldLog('info')) {
      console.log(`🎯 Context optimization started: ${chunks.length} chunks (${event.data.totalTokens} tokens) -> budget: ${maxTokens} tokens`);
    }
  }

  /**
   * Log scoring completion with detailed breakdown.
   */
  logScoringComplete(scoringResults: ScoringResult[], processingTimeMs: number): void {
    const breakdown = this.calculateScoringBreakdown(scoringResults);
    
    const event: ContextOptimizationEvent = {
      timestamp: Date.now(),
      type: 'scoring_complete',
      data: {
        totalChunks: scoringResults.length,
        processingTimeMs,
        breakdown,
        topScores: scoringResults
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(r => ({ chunkId: r.chunkId, score: r.score.toFixed(3) })),
      },
    };

    this.addEvent(event);

    if (this.shouldLog('debug')) {
      console.log(`📊 Scoring complete: ${scoringResults.length} chunks in ${processingTimeMs}ms`);
      console.log(`   BM25: ${breakdown.bm25Average.toFixed(3)}, Recency: ${breakdown.recencyAverage.toFixed(3)}`);
      console.log(`   Embedding: ${breakdown.embeddingAverage.toFixed(3)}, Hybrid: ${breakdown.hybridAverage.toFixed(3)}`);
    }
  }

  /**
   * Log pruning completion with statistics.
   */
  logPruningComplete(stats: PruningStats, mandatoryCount: number, selectedChunks: ConversationChunk[]): void {
    const event: ContextOptimizationEvent = {
      timestamp: Date.now(),
      type: 'pruning_complete',
      data: {
        ...stats,
        mandatoryChunks: mandatoryCount,
        selectedChunkIds: selectedChunks.map(c => c.id),
        roleDistribution: this.getChunkTypeBreakdown(selectedChunks),
      },
    };

    this.addEvent(event);

    if (this.shouldLog('info')) {
      console.log(`✂️  Pruning complete: ${stats.originalChunks} -> ${stats.prunedChunks} chunks (${stats.reductionPercentage.toFixed(1)}% reduction)`);
      console.log(`   Tokens: ${stats.originalTokens} -> ${stats.prunedTokens} (${((stats.originalTokens - stats.prunedTokens) / stats.originalTokens * 100).toFixed(1)}% reduction)`);
      console.log(`   Mandatory chunks preserved: ${mandatoryCount}`);
    }
  }

  /**
   * Log complete optimization with comprehensive details.
   */
  logOptimizationComplete(logEntry: OptimizationLogEntry): void {
    const event: ContextOptimizationEvent = {
      timestamp: Date.now(),
      type: 'optimization_complete',
      data: logEntry,
    };

    this.addEvent(event);

    if (this.shouldLog('info')) {
      console.log(`🎉 Context optimization complete:`);
      console.log(`   Query: "${this.truncateString(logEntry.query, 50)}"`);
      console.log(`   Chunks: ${logEntry.originalChunks} -> ${logEntry.finalChunks} (${((logEntry.originalChunks - logEntry.finalChunks) / logEntry.originalChunks * 100).toFixed(1)}% reduction)`);
      console.log(`   Tokens: ${logEntry.originalTokens} -> ${logEntry.finalTokens} (${logEntry.reductionPercentage.toFixed(1)}% reduction)`);
      console.log(`   Processing time: ${logEntry.processingTimeMs}ms`);
      console.log(`   Top chunks: ${logEntry.topScoredChunks.map(c => `${c.id}(${c.score.toFixed(2)})`).join(', ')}`);
    }

    if (this.shouldLog('debug')) {
      console.log(`   Scoring averages:`, logEntry.scoringBreakdown);
      console.log(`   Pruned chunks: ${logEntry.prunedChunks.slice(0, 5).join(', ')}${logEntry.prunedChunks.length > 5 ? '...' : ''}`);
    }
  }

  /**
   * Log error with context.
   */
  logError(error: Error, context: string, additionalData?: Record<string, unknown>): void {
    const event: ContextOptimizationEvent = {
      timestamp: Date.now(),
      type: 'error',
      data: {
        error: error.message,
        stack: error.stack,
        context,
        additionalData,
      },
    };

    this.addEvent(event);

    if (this.shouldLog('error')) {
      console.error(`❌ Context optimization error in ${context}:`, error.message);
      if (additionalData && this.shouldLog('debug')) {
        console.error(`   Additional data:`, additionalData);
      }
    }
  }

  /**
   * Get recent optimization statistics.
   */
  getRecentStats(count = 10): OptimizationLogEntry[] {
    return this.events
      .filter(e => e.type === 'optimization_complete')
      .slice(-count)
      .map(e => e.data as OptimizationLogEntry);
  }

  /**
   * Get performance summary.
   */
  getPerformanceSummary(): {
    totalOptimizations: number;
    averageProcessingTime: number;
    averageTokenReduction: number;
    averageChunkReduction: number;
    errorRate: number;
  } {
    const optimizations = this.events.filter(e => e.type === 'optimization_complete');
    const errors = this.events.filter(e => e.type === 'error');

    if (optimizations.length === 0) {
      return {
        totalOptimizations: 0,
        averageProcessingTime: 0,
        averageTokenReduction: 0,
        averageChunkReduction: 0,
        errorRate: 0,
      };
    }

    const avgProcessingTime = optimizations.reduce((sum, e) => sum + e.data.processingTimeMs, 0) / optimizations.length;
    const avgTokenReduction = optimizations.reduce((sum, e) => sum + e.data.reductionPercentage, 0) / optimizations.length;
    const avgChunkReduction = optimizations.reduce((sum, e) => {
      const reduction = ((e.data.originalChunks - e.data.finalChunks) / e.data.originalChunks) * 100;
      return sum + reduction;
    }, 0) / optimizations.length;

    return {
      totalOptimizations: optimizations.length,
      averageProcessingTime: avgProcessingTime,
      averageTokenReduction: avgTokenReduction,
      averageChunkReduction: avgChunkReduction,
      errorRate: (errors.length / (optimizations.length + errors.length)) * 100,
    };
  }

  /**
   * Export logs for analysis.
   */
  exportLogs(): ContextOptimizationEvent[] {
    return [...this.events];
  }

  /**
   * Clear all logs.
   */
  clearLogs(): void {
    this.events = [];
  }

  /**
   * Set log level.
   */
  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logLevel = level;
  }

  private addEvent(event: ContextOptimizationEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private truncateString(str: string, maxLength: number): string {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  }

  private getChunkTypeBreakdown(chunks: ConversationChunk[]): Record<string, number> {
    const breakdown: Record<string, number> = { user: 0, assistant: 0, tool: 0 };
    for (const chunk of chunks) {
      breakdown[chunk.role] = (breakdown[chunk.role] || 0) + 1;
    }
    return breakdown;
  }

  private calculateScoringBreakdown(results: ScoringResult[]): {
    bm25Average: number;
    recencyAverage: number;
    embeddingAverage: number;
    hybridAverage: number;
  } {
    if (results.length === 0) {
      return { bm25Average: 0, recencyAverage: 0, embeddingAverage: 0, hybridAverage: 0 };
    }

    const totals = results.reduce((acc, result) => ({
      bm25: acc.bm25 + (result.breakdown.bm25 || 0),
      recency: acc.recency + (result.breakdown.recency || 0),
      embedding: acc.embedding + (result.breakdown.embedding || 0),
      hybrid: acc.hybrid + result.score,
    }), { bm25: 0, recency: 0, embedding: 0, hybrid: 0 });

    return {
      bm25Average: totals.bm25 / results.length,
      recencyAverage: totals.recency / results.length,
      embeddingAverage: totals.embedding / results.length,
      hybridAverage: totals.hybrid / results.length,
    };
  }
}