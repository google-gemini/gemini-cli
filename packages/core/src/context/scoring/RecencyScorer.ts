/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk, RelevanceQuery, ScoringResult } from '../types.js';

/**
 * Recency scorer that applies time-based decay to conversation chunks.
 * More recent chunks get higher scores with exponential decay over time.
 */
export class RecencyScorer {
  private decayRate: number;

  constructor(decayRate = 1.0) {
    this.decayRate = decayRate;
  }

  /**
   * Score chunks based on recency relative to the query timestamp.
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