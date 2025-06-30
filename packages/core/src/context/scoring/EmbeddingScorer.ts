/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk, RelevanceQuery, ScoringResult } from '../types.js';

/**
 * Function type for generating embeddings from text.
 */
export type EmbeddingGenerator = (text: string) => Promise<number[]>;

/**
 * EmbeddingScorer calculates semantic similarity using cosine similarity between embeddings.
 * Supports both pre-computed embeddings and runtime generation.
 */
export class EmbeddingScorer {
  private embeddingGenerator?: EmbeddingGenerator;

  constructor(embeddingGenerator?: EmbeddingGenerator) {
    this.embeddingGenerator = embeddingGenerator;
  }

  /**
   * Score chunks based on semantic similarity to the query using embeddings.
   */
  async scoreChunks(chunks: ConversationChunk[], query: RelevanceQuery): Promise<ScoringResult[]> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      // Generate query embedding if possible
      let queryEmbedding: number[] | null = null;
      
      if (this.embeddingGenerator && query.text.trim()) {
        try {
          queryEmbedding = await this.embeddingGenerator(query.text);
        } catch (error) {
          // Fall back to zero scores if embedding generation fails
          queryEmbedding = null;
        }
      }

      // Score each chunk
      const results = chunks.map(chunk => {
        const score = this.calculateSimilarity(queryEmbedding, chunk.metadata.embedding);
        
        return {
          chunkId: chunk.id,
          score: this.clampScore(score),
          breakdown: { embedding: this.clampScore(score) },
        };
      });

      return results;
    } catch (error) {
      // Fallback: return zero scores for all chunks
      return chunks.map(chunk => ({
        chunkId: chunk.id,
        score: 0,
        breakdown: { embedding: 0 },
      }));
    }
  }

  /**
   * Calculate cosine similarity between query and chunk embeddings.
   */
  private calculateSimilarity(queryEmbedding: number[] | null, chunkEmbedding?: number[]): number {
    // Return 0 if either embedding is missing
    if (!queryEmbedding || !chunkEmbedding) {
      return 0;
    }

    // Return 0 if dimensions don't match
    if (queryEmbedding.length !== chunkEmbedding.length) {
      return 0;
    }

    // Return 0 if either embedding is empty
    if (queryEmbedding.length === 0) {
      return 0;
    }

    try {
      const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
      
      // Handle invalid similarity values
      if (!Number.isFinite(similarity)) {
        return 0;
      }

      // Clamp negative similarities to 0 (only positive similarity is useful)
      return Math.max(0, similarity);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    // Calculate dot product
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
      const a = vectorA[i];
      const b = vectorB[i];
      
      // Skip invalid values
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        continue;
      }
      
      dotProduct += a * b;
    }

    // Calculate magnitudes
    const magnitudeA = this.magnitude(vectorA);
    const magnitudeB = this.magnitude(vectorB);

    // Avoid division by zero
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Calculate vector magnitude (Euclidean norm).
   */
  private magnitude(vector: number[]): number {
    let sum = 0;
    for (const value of vector) {
      if (Number.isFinite(value)) {
        sum += value * value;
      }
    }
    return Math.sqrt(sum);
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
}