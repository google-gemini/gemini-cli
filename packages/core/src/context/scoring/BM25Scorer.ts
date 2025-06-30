/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk, RelevanceQuery, ScoringResult } from '../types.js';

/**
 * BM25 scorer for lexical relevance using TF-IDF with BM25 weighting.
 * Provides fast, deterministic scoring based on term frequency and inverse document frequency.
 */
export class BM25Scorer {
  private k1 = 1.2; // Term frequency saturation parameter
  private b = 0.75; // Length normalization parameter
  private index: Map<string, Map<string, number>> = new Map(); // term -> {docId -> frequency}
  private docLengths: Map<string, number> = new Map();
  private avgDocLength = 0;
  private totalDocs = 0;

  /**
   * Score chunks based on BM25 relevance to the query.
   */
  scoreChunks(chunks: ConversationChunk[], query: RelevanceQuery): ScoringResult[] {
    this.updateIndex(chunks);
    const queryTerms = this.tokenize(query.text);
    
    if (queryTerms.length === 0) {
      return chunks.map(chunk => ({
        chunkId: chunk.id,
        score: 0,
        breakdown: { bm25: 0 },
      }));
    }

    const scores = chunks.map(chunk => {
      const score = this.calculateBM25Score(chunk.id, queryTerms);
      return {
        chunkId: chunk.id,
        score,
        breakdown: { bm25: score },
      };
    });

    // Normalize scores to 0-1 range
    const maxScore = Math.max(...scores.map(s => s.score));
    if (maxScore === 0) {
      // If all scores are 0, return them as-is
      return scores;
    }
    
    return scores.map(result => ({
      ...result,
      score: result.score / maxScore,
      breakdown: { bm25: result.score / maxScore },
    }));
  }

  /**
   * Update the BM25 index with current chunks.
   */
  private updateIndex(chunks: ConversationChunk[]): void {
    this.index.clear();
    this.docLengths.clear();
    this.totalDocs = chunks.length;

    let totalLength = 0;

    // Build term frequency index
    for (const chunk of chunks) {
      const terms = this.tokenize(chunk.content);
      const termFreq = new Map<string, number>();
      
      this.docLengths.set(chunk.id, terms.length);
      totalLength += terms.length;

      // Count term frequencies in this document
      for (const term of terms) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }

      // Add to inverted index
      for (const [term, freq] of Array.from(termFreq.entries())) {
        if (!this.index.has(term)) {
          this.index.set(term, new Map());
        }
        this.index.get(term)!.set(chunk.id, freq);
      }
    }

    this.avgDocLength = this.totalDocs > 0 ? totalLength / this.totalDocs : 0;
  }

  /**
   * Calculate BM25 score for a document against query terms.
   */
  private calculateBM25Score(docId: string, queryTerms: string[]): number {
    let score = 0;
    const docLength = this.docLengths.get(docId) || 0;

    for (const term of queryTerms) {
      const termDocs = this.index.get(term);
      if (!termDocs || !termDocs.has(docId)) {
        continue;
      }

      const tf = termDocs.get(docId) || 0;
      const df = termDocs.size; // Number of documents containing the term
      
      // Modified IDF calculation that handles edge cases while maintaining discrimination
      let idf: number;
      if (this.totalDocs === 1) {
        // For single documents, use TF-based scoring with base IDF
        idf = 1.0;
      } else {
        // Standard BM25 IDF with safeguards
        const idfRaw = Math.log((this.totalDocs - df + 0.5) / (df + 0.5));
        // Ensure IDF is non-negative for better behavior with small collections
        idf = Math.max(idfRaw, 0.1);
      }

      // BM25 formula
      const numerator = tf * (this.k1 + 1);
      const avgDocLengthSafe = this.avgDocLength || 1; // Avoid division by zero
      const denominator = tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLengthSafe));
      
      score += idf * (numerator / denominator);
    }

    return Math.max(0, score);
  }

  /**
   * Tokenize text into normalized terms.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .split(/\s+/)
      .filter(term => term.length > 0)
      .filter(term => !this.isStopWord(term));
  }

  /**
   * Check if a term is a stop word.
   */
  private isStopWord(term: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    ]);
    return stopWords.has(term);
  }
}