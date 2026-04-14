/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TFIDFEmbedder } from './embeddingService.js';
import { cosineSimilarity } from './contextWindow.js';

describe('TFIDFEmbedder', () => {
  it('should produce a non-zero vector for non-empty text', () => {
    const embedder = new TFIDFEmbedder();
    const vec = embedder.embed('hello world');
    expect(vec.some((v) => v !== 0)).toBe(true);
  });

  it('should produce a zero vector for empty text', () => {
    const embedder = new TFIDFEmbedder();
    const vec = embedder.embed('');
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it('should produce similar embeddings for similar texts', () => {
    const embedder = new TFIDFEmbedder();
    // Embed related texts to build vocabulary
    embedder.embed('the cat sat on the mat');
    embedder.embed('the dog ran in the park');
    embedder.embed('javascript typescript programming');

    const v1 = embedder.embed('the cat sat on the mat');
    const v2 = embedder.embed('the cat lay on the mat');
    const v3 = embedder.embed('javascript typescript programming');

    const simCats = cosineSimilarity(v1, v2);
    const simCatJs = cosineSimilarity(v1, v3);
    expect(simCats).toBeGreaterThan(simCatJs);
  });

  it('should produce different embeddings for different topics', () => {
    const embedder = new TFIDFEmbedder();
    embedder.embed('quantum physics particle accelerator');
    embedder.embed('chocolate cake recipe baking');

    const v1 = embedder.embed('quantum physics particle accelerator');
    const v2 = embedder.embed('chocolate cake recipe baking');

    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeLessThan(0.3);
  });

  it('should handle single-word text', () => {
    const embedder = new TFIDFEmbedder();
    const vec = embedder.embed('hello');
    expect(vec.some((v) => v !== 0)).toBe(true);
  });

  it('should build vocabulary incrementally', () => {
    const embedder = new TFIDFEmbedder();
    const v1 = embedder.embed('alpha');
    const vocabSize1 = v1.length;

    const v2 = embedder.embed('beta gamma');
    const vocabSize2 = v2.length;

    // Vocabulary should grow
    expect(vocabSize2).toBeGreaterThan(vocabSize1);
  });

  it('should apply IDF weighting to reduce common word importance', () => {
    const embedder = new TFIDFEmbedder();
    // 'the' appears in many documents, 'quantum' in few
    embedder.embed('the cat');
    embedder.embed('the dog');
    embedder.embed('the fish');
    embedder.embed('quantum physics');

    const vec = embedder.embed('the quantum');
    const vocab = embedder.getVocabulary();
    const theIdx = vocab.indexOf('the');
    const quantumIdx = vocab.indexOf('quantum');

    // 'quantum' should have higher weight because it appears in fewer docs
    expect(theIdx).toBeGreaterThanOrEqual(0);
    expect(quantumIdx).toBeGreaterThanOrEqual(0);
    expect(Math.abs(vec[quantumIdx])).toBeGreaterThan(Math.abs(vec[theIdx]));
  });

  it('embedQuery should not mutate vocabulary or doc count', () => {
    const embedder = new TFIDFEmbedder();
    embedder.embed('alpha beta');
    embedder.embed('gamma delta');
    const vocabBefore = embedder.getVocabulary().length;

    // embedQuery with new terms should not grow vocab
    const qvec = embedder.embedQuery('epsilon zeta');
    const vocabAfter = embedder.getVocabulary().length;

    expect(vocabAfter).toBe(vocabBefore);
    // Unknown terms should produce a zero vector (no known terms matched)
    expect(qvec.every((v) => v === 0)).toBe(true);
  });

  it('embedQuery should use existing vocabulary for known terms', () => {
    const embedder = new TFIDFEmbedder();
    embedder.embed('cat dog fish');

    const qvec = embedder.embedQuery('cat');
    // Should produce non-zero vector since 'cat' is in vocab
    expect(qvec.some((v) => v !== 0)).toBe(true);
    // Same dimension as current vocab
    expect(qvec.length).toBe(embedder.getVocabulary().length);
  });

  it('should normalize vectors', () => {
    const embedder = new TFIDFEmbedder();
    const vec = embedder.embed('test normalization vector');
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    // Normalized vector should have unit length
    expect(norm).toBeGreaterThan(0);
    expect(norm).toBeCloseTo(1.0, 3);
  });
});
