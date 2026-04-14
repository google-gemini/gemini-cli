/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Embedder } from './contextWindow.js';

/**
 * TF-IDF embedder for local, deterministic text similarity.
 *
 * Builds vocabulary incrementally from the conversation corpus.
 * No API calls — purely local computation.
 */
export class TFIDFEmbedder implements Embedder {
  private _vocab: Map<string, number> = new Map(); // term -> index
  private _docCount = 0;
  private _termDocFreq: Map<string, number> = new Map(); // term -> # docs containing it

  embed(text: string): number[] {
    const tokens = this._tokenize(text);
    if (tokens.length === 0) {
      return new Array<number>(Math.max(this._vocab.size, 1)).fill(0);
    }

    // Update vocabulary with new terms
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      if (!this._vocab.has(token)) {
        this._vocab.set(token, this._vocab.size);
      }
    }

    // Update document frequency
    this._docCount++;
    for (const token of uniqueTokens) {
      this._termDocFreq.set(token, (this._termDocFreq.get(token) ?? 0) + 1);
    }

    // Compute TF-IDF vector
    const vec = new Array<number>(this._vocab.size).fill(0);
    const termFreq = new Map<string, number>();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }

    for (const [term, count] of termFreq) {
      const idx = this._vocab.get(term);
      if (idx === undefined) continue;

      const tf = count / tokens.length;
      const df = this._termDocFreq.get(term) ?? 1;
      const idf = Math.log(1 + this._docCount / df);
      vec[idx] = tf * idf;
    }

    // L2 normalize
    const norm = Math.sqrt(
      vec.reduce((sum: number, v: number) => sum + v * v, 0),
    );
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  }

  /**
   * Embed without mutating vocabulary, docCount, or termDocFreq.
   * Used for queries/retrieval so searching doesn't contaminate the corpus.
   */
  embedQuery(text: string): number[] {
    const tokens = this._tokenize(text);
    if (tokens.length === 0) {
      return new Array<number>(Math.max(this._vocab.size, 1)).fill(0);
    }

    const vec = new Array<number>(this._vocab.size).fill(0);
    const termFreq = new Map<string, number>();

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }

    for (const [term, count] of termFreq) {
      const idx = this._vocab.get(term);
      if (idx === undefined) continue; // unknown terms ignored

      const tf = count / tokens.length;
      const df = this._termDocFreq.get(term) ?? 1;
      const idf = Math.log(1 + this._docCount / df);
      vec[idx] = tf * idf;
    }

    // L2 normalize
    const norm = Math.sqrt(
      vec.reduce((sum: number, v: number) => sum + v * v, 0),
    );
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) {
        vec[i] /= norm;
      }
    }

    return vec;
  }

  getVocabulary(): string[] {
    const vocab = new Array<string>(this._vocab.size);
    for (const [term, idx] of this._vocab) {
      vocab[idx] = term;
    }
    return vocab;
  }

  private _tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }
}
