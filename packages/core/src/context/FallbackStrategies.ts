/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConversationChunk,
  RelevanceQuery,
  ContextWindow,
} from './types.js';

/**
 * Interface for fallback strategies when scoring fails.
 */
export interface FallbackStrategy {
  name: string;
  priority: number;
  execute(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    budget: number,
  ): Promise<ContextWindow>;
}

/**
 * Recency-based fallback strategy using exponential decay scoring.
 * Provides deterministic chunk selection based on temporal relevance.
 */
export class RecencyFallbackStrategy implements FallbackStrategy {
  name = 'recency-fallback';
  priority = 1;

  async execute(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    budget: number,
  ): Promise<ContextWindow> {
    if (chunks.length === 0 || budget <= 0) {
      return {
        chunks: [],
        totalTokens: 0,
        maxTokens: budget,
      };
    }

    // Score chunks based on recency with exponential decay
    const queryTime = query.timestamp || Date.now();
    const scoredChunks = chunks.map((chunk) => {
      // Calculate time difference in hours
      const timeDiffHours = Math.max(
        0,
        (queryTime - chunk.timestamp) / (1000 * 60 * 60),
      );

      // Exponential decay: more recent chunks get higher scores
      // Half-life of 24 hours (score halves every 24 hours)
      const recencyScore = Math.exp(-timeDiffHours / 24);

      // Boost pinned chunks and system prompts
      let finalScore = recencyScore;
      if (chunk.metadata.pinned === true) {
        finalScore += 1.0; // Ensure pinned chunks rank highest
      }
      if (
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition')
      ) {
        finalScore += 0.5; // Boost mandatory chunks
      }

      return { chunk, score: finalScore };
    });

    // Sort by score (highest first)
    scoredChunks.sort((a, b) => b.score - a.score);

    // Build selection tracking which chunks to include
    const selectedChunkIds = new Set<string>();
    let totalTokens = 0;

    // First pass: Always include mandatory chunks regardless of budget
    for (const { chunk } of scoredChunks) {
      if (
        chunk.metadata.pinned === true ||
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition')
      ) {
        selectedChunkIds.add(chunk.id);
        totalTokens += chunk.tokens;
      }
    }

    // Second pass: Add non-mandatory chunks within remaining budget
    for (const { chunk } of scoredChunks) {
      const isMandatory =
        chunk.metadata.pinned === true ||
        chunk.metadata.tags?.includes('system-prompt') ||
        chunk.metadata.tags?.includes('tool-definition');

      if (
        !isMandatory &&
        !selectedChunkIds.has(chunk.id) &&
        totalTokens + chunk.tokens <= budget
      ) {
        selectedChunkIds.add(chunk.id);
        totalTokens += chunk.tokens;
      }
    }

    // Restore original order while filtering selected chunks
    const selectedChunks = chunks.filter((chunk) =>
      selectedChunkIds.has(chunk.id),
    );
    const actualTotalTokens = selectedChunks.reduce(
      (sum, chunk) => sum + chunk.tokens,
      0,
    );

    return {
      chunks: selectedChunks,
      totalTokens: actualTotalTokens,
      maxTokens: budget,
    };
  }
}

/**
 * Simple truncation fallback strategy.
 * Preserves mandatory chunks and truncates chronologically from the end.
 */
export class SimpleTruncationFallbackStrategy implements FallbackStrategy {
  name = 'simple-truncation-fallback';
  priority = 2;

  async execute(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    budget: number,
  ): Promise<ContextWindow> {
    if (chunks.length === 0 || budget <= 0) {
      return {
        chunks: [],
        totalTokens: 0,
        maxTokens: budget,
      };
    }

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
    // Sort optional chunks by timestamp (newest first)
    optionalChunks.sort((a, b) => b.timestamp - a.timestamp);

    for (const chunk of optionalChunks) {
      if (totalTokens + chunk.tokens <= budget) {
        selectedChunks.push(chunk);
        totalTokens += chunk.tokens;
      }
    }

    // Restore chronological order for final output
    selectedChunks.sort((a, b) => a.timestamp - b.timestamp);

    return {
      chunks: selectedChunks,
      totalTokens,
      maxTokens: budget,
    };
  }
}

/**
 * Fallback strategy manager that executes strategies in priority order.
 */
export class FallbackStrategyManager {
  private strategies: FallbackStrategy[] = [
    new RecencyFallbackStrategy(),
    new SimpleTruncationFallbackStrategy(),
  ];

  /**
   * Execute fallback strategies in priority order until one succeeds.
   */
  async executeFallback(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
    budget: number,
  ): Promise<ContextWindow> {
    // Sort strategies by priority
    const sortedStrategies = [...this.strategies].sort(
      (a, b) => a.priority - b.priority,
    );

    for (const strategy of sortedStrategies) {
      try {
        const result = await strategy.execute(chunks, query, budget);

        // Validate result
        if (
          result.chunks.length >= 0 &&
          result.totalTokens >= 0 &&
          result.maxTokens === budget
        ) {
          return result;
        }
      } catch (error) {
        // Log error and continue to next strategy
        console.warn(`Fallback strategy '${strategy.name}' failed:`, error);
        continue;
      }
    }

    // Ultimate fallback: empty context
    return {
      chunks: [],
      totalTokens: 0,
      maxTokens: budget,
    };
  }

  /**
   * Add a custom fallback strategy.
   */
  addStrategy(strategy: FallbackStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Get all available strategies.
   */
  getStrategies(): FallbackStrategy[] {
    return [...this.strategies];
  }
}
