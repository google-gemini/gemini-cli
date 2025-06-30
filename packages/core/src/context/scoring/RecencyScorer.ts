/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk, RelevanceQuery, ScoringResult } from '../types.js';

/**
 * Recency scorer that applies time-based decay to conversation chunks.
 * More recent chunks get higher scores with exponential decay over time.
 * 
 * Implements exponential decay scoring where recency score decreases
 * exponentially with time difference from query timestamp.
 */
export class RecencyScorer {
  private decayRate: number;

  /**
   * Creates a new RecencyScorer instance.
   * @param decayRate - The decay rate for exponential time decay (default: 1.0)
   */
  constructor(decayRate = 1.0) {
    this.decayRate = decayRate;
  }

  /**
   * Score chunks based on recency relative to the query timestamp.
   * @param chunks - Array of conversation chunks to score
   * @param query - Relevance query containing timestamp reference
   * @returns Array of scoring results with recency scores
   */
  scoreChunks(chunks: ConversationChunk[], query: RelevanceQuery): ScoringResult[] {
    const queryTime = query.timestamp || Date.now();
    
    return chunks.map(chunk => {
      const score = this.calculateRecencyScore(chunk.timestamp, queryTime);
      return {
        chunkId: chunk.id,
        score,
        breakdown: { recency: score },
      };
    });
  }

  /**
   * Calculate recency score using exponential decay.
   * @param chunkTime - Timestamp of the chunk in milliseconds
   * @param queryTime - Reference timestamp for the query in milliseconds  
   * @returns Recency score between 0 and 1, where 1 is most recent
   */
  private calculateRecencyScore(chunkTime: number, queryTime: number): number {
    const timeDiff = Math.abs(queryTime - chunkTime);
    const hours = timeDiff / (1000 * 60 * 60); // Convert to hours
    
    // Exponential decay: e^(-decay_rate * hours)
    // At 0 hours: score = 1.0
    // At 1 hour: score ≈ 0.37 (with decay_rate = 1.0)
    // At 24 hours: score ≈ 0.000000006
    return Math.exp(-this.decayRate * hours);
  }
}