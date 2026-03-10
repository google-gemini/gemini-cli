/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../core/contentGenerator.js';

/**
 * A dense embedding vector produced by an embedding model.
 */
export interface EmbeddingVector {
  values: number[];
}

/**
 * Strategy interface for text embedding.
 * Concrete implementations are injected into ContextEngine at construction
 * time — no switch/if on type strings inside business logic.
 *
 * @example
 * ```ts
 * const strategy: EmbeddingStrategy = new GeminiEmbeddingStrategy(generator);
 * const vector = await strategy.embed('how does auth work?');
 * ```
 */
export interface EmbeddingStrategy {
  /**
   * Converts a plain text string into a dense embedding vector.
   * The dimensionality is determined by the underlying model.
   */
  embed(text: string): Promise<EmbeddingVector>;
}

/**
 * Embedding strategy that calls the Gemini Embedding API via the existing
 * `ContentGenerator.embedContent()` interface. Requires no additional SDK
 * dependencies since `ContentGenerator` is already wired into the CLI.
 */
export class GeminiEmbeddingStrategy implements EmbeddingStrategy {
  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly model = 'text-embedding-004',
  ) {}

  async embed(text: string): Promise<EmbeddingVector> {
    const response = await this.contentGenerator.embedContent({
      model: this.model,
      contents: text,
    });

    const values = response?.embeddings?.[0]?.values ?? [];
    return { values };
  }
}

/**
 * Stub for a future local ONNX embedding strategy (offline, no API key needed).
 * Exists so the interface contract is proven complete without pulling in heavy deps.
 */
export class LocalOnnxEmbeddingStrategy implements EmbeddingStrategy {
  async embed(_text: string): Promise<EmbeddingVector> {
    throw new Error(
      'LocalOnnxEmbeddingStrategy is not yet implemented. ' +
        'Use GeminiEmbeddingStrategy instead.',
    );
  }
}
