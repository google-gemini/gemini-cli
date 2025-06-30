/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConversationChunk,
  RelevanceQuery,
  ScoringWeights,
  ScoringResult,
} from '../types.js';
import { BM25Scorer } from './BM25Scorer.js';
import { EmbeddingScorer } from './EmbeddingScorer.js';
import { RecencyScorer } from './RecencyScorer.js';

/**
 * HybridScorer combines multiple scoring algorithms with configurable weights.
 * Uses α × embedding + β × bm25 + γ × recency + δ × manual formula for final scores.
 */
export class HybridScorer {
  private weights: ScoringWeights;
  private bm25Scorer: BM25Scorer;
  private embeddingScorer: EmbeddingScorer;
  private recencyScorer: RecencyScorer;

  constructor(weights?: ScoringWeights) {
    // Default weights as specified in PLAN.md
    this.weights = weights || {
      embedding: 0.4, // α
      bm25: 0.4, // β
      recency: 0.15, // γ
      manual: 0.05, // δ
    };

    this.bm25Scorer = new BM25Scorer();
    this.embeddingScorer = new EmbeddingScorer();
    this.recencyScorer = new RecencyScorer();
  }

  /**
   * Score chunks using weighted combination of all scoring algorithms.
   */
  async scoreChunks(
    chunks: ConversationChunk[],
    query: RelevanceQuery,
  ): Promise<ScoringResult[]> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      // Get scores from all algorithms
      const [bm25Results, embeddingResults, recencyResults] =
        await Promise.allSettled([
          this.safeScoreChunks(this.bm25Scorer, chunks, query),
          this.safeScoreChunks(this.embeddingScorer, chunks, query),
          this.safeScoreChunks(this.recencyScorer, chunks, query),
        ]);

      // Extract results, defaulting to empty arrays on failure
      const bm25Scores = this.extractResults(bm25Results);
      const embeddingScores = this.extractResults(embeddingResults);
      const recencyScores = this.extractResults(recencyResults);

      // Create lookup maps for efficient access
      const bm25Map = new Map(bm25Scores.map((r) => [r.chunkId, r.score]));
      const embeddingMap = new Map(
        embeddingScores.map((r) => [r.chunkId, r.score]),
      );
      const recencyMap = new Map(
        recencyScores.map((r) => [r.chunkId, r.score]),
      );

      // Combine scores for each chunk
      const results = chunks.map((chunk) => {
        const embeddingScore = embeddingMap.get(chunk.id) || 0;
        const bm25Score = bm25Map.get(chunk.id) || 0;
        const recencyScore = recencyMap.get(chunk.id) || 0;
        const manualScore = this.getManualScore(chunk);

        // Apply weighted combination formula
        const finalScore = this.calculateWeightedScore(
          embeddingScore,
          bm25Score,
          recencyScore,
          manualScore,
        );

        return {
          chunkId: chunk.id,
          score: this.clampScore(finalScore),
          breakdown: {
            embedding: embeddingScore,
            bm25: bm25Score,
            recency: recencyScore,
            manual: manualScore,
          },
        };
      });

      return results;
    } catch (error) {
      // Fallback: return zero scores for all chunks
      return chunks.map((chunk) => ({
        chunkId: chunk.id,
        score: 0,
        breakdown: {
          embedding: 0,
          bm25: 0,
          recency: 0,
          manual: 0,
        },
      }));
    }
  }

  /**
   * Update scoring weights at runtime.
   */
  updateWeights(newWeights: ScoringWeights): void {
    this.weights = { ...newWeights };
  }

  /**
   * Calculate weighted score using the hybrid formula.
   */
  private calculateWeightedScore(
    embedding: number,
    bm25: number,
    recency: number,
    manual: number,
  ): number {
    return (
      this.weights.embedding * embedding +
      this.weights.bm25 * bm25 +
      this.weights.recency * recency +
      this.weights.manual * manual
    );
  }

  /**
   * Get manual boost score for pinned chunks.
   */
  private getManualScore(chunk: ConversationChunk): number {
    return chunk.metadata.pinned ? 1.0 : 0;
  }

  /**
   * Clamp score to valid range [0, 1].
   */
  private clampScore(score: number): number {
    if (!Number.isFinite(score)) {
      return 0;
    }
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Safely call scorer with error handling.
   */
  private async safeScoreChunks(
    scorer: BM25Scorer | EmbeddingScorer | RecencyScorer,
    chunks: ConversationChunk[],
    query: RelevanceQuery,
  ): Promise<ScoringResult[]> {
    try {
      // Handle both sync and async scorers
      const result = scorer.scoreChunks(chunks, query);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      // Return zero scores for all chunks on error
      return chunks.map((chunk) => ({
        chunkId: chunk.id,
        score: 0,
        breakdown: {},
      }));
    }
  }

  /**
   * Extract results from Promise.allSettled result.
   */
  private extractResults(
    result: PromiseSettledResult<ScoringResult[]>,
  ): ScoringResult[] {
    return result.status === 'fulfilled' ? result.value : [];
  }
}
