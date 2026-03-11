/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { Config } from '../config/config.js';
import type { FileDiscoveryService } from './fileDiscoveryService.js';
import type {
  EmbeddingStrategy,
  EmbeddingVector,
} from '../rag/embeddingStrategy.js';
import type { VectorStore } from '../rag/vectorStore.js';
import { glob } from 'glob';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * A single chunk of text retrieved from the workspace index.
 */
export interface ContentChunk {
  /** Absolute file path or URL the chunk came from. */
  source: string;
  /** Raw text of the chunk. */
  text: string;
  /** Cosine similarity score [0, 1] against the query. */
  score: number;
}

/**
 * ContextEngine is the central orchestration service for workspace context
 * retrieval. It lives in `packages/core/src/services/` alongside
 * `chatCompressionService`, `loopDetectionService`, and
 * `toolOutputMaskingService`.
 *
 * Both `EmbeddingStrategy` and `VectorStore` are injected at construction
 * time (Strategy pattern) — no concrete types appear in business logic.
 *
 * Responsibilities:
 *  1. Index workspace files into the injected `VectorStore` at startup.
 *  2. On each query, embed via the injected `EmbeddingStrategy` and retrieve
 *     the top-K most semantically similar chunks.
 *  3. Format those chunks as a synthetic `Content` turn for the `BeforeModel`
 *     hook (`ragHook.ts`) to prepend to the API request.
 *
 * @example
 * ```ts
 * const engine = new ContextEngine(
 *   config,
 *   new GeminiEmbeddingStrategy(contentGenerator),
 *   new InMemoryVectorStore(),
 * );
 * await engine.indexWorkspace();
 * const chunks = await engine.retrieveContext('how does auth work?');
 * const content = engine.formatAsContent(chunks);
 * ```
 */
export class ContextEngine {
  constructor(
    private readonly config: Config,
    private readonly embedding: EmbeddingStrategy, // Strategy — never a concrete type
    private readonly vectorStore: VectorStore, // Strategy — never a concrete type
    private readonly fileService?: FileDiscoveryService, // optional — falls back to config.getFileService()
  ) {}

  /**
   * Walks the workspace, chunks each file, embeds via `EmbeddingStrategy`,
   * and upserts into `VectorStore`. Safe to call multiple times — each call
   * rebuilds the index from scratch via `VectorStore.clear()`.
   */
  async indexWorkspace(): Promise<void> {
    this.vectorStore.clear();

    const workspaceDirs = this.config.getWorkspaceContext().getDirectories();

    for (const dir of workspaceDirs) {
      const allPaths = await glob('**/*', {
        cwd: dir,
        nodir: true,
        absolute: true,
      });

      const service = this.fileService ?? this.config.getFileService();
      const filteredPaths = service.filterFiles(allPaths);

      for (const filePath of filteredPaths) {
        try {
          const chunks = await this.chunkFile(filePath);
          for (let i = 0; i < chunks.length; i++) {
            const text = chunks[i];
            const vector: EmbeddingVector = await this.embedding.embed(text);
            this.vectorStore.upsert({
              id: `${filePath}#${i}`,
              text,
              source: filePath,
              vector,
            });
          }
        } catch (err) {
          // Skip unreadable files (binary, permissions, etc.) but log for debugging.
          debugLogger.warn(
            `ContextEngine: skipping file during indexing: ${filePath}`,
            err,
          );
        }
      }
    }
  }

  /**
   * Retrieves the top-K most semantically similar chunks for a user query.
   * Returns an empty array when the index is empty or the query is blank.
   *
   * @param query - The user's natural-language question or intent.
   * @param topK  - Maximum number of chunks to return. Defaults to 5.
   */
  async retrieveContext(query: string, topK = 5): Promise<ContentChunk[]> {
    const trimmed = query.trim();
    if (!trimmed || this.vectorStore.size === 0) return [];

    const queryVector = await this.embedding.embed(trimmed);
    return this.vectorStore
      .query(queryVector, topK)
      .map((m) => ({ source: m.source, text: m.text, score: m.score }));
  }

  /**
   * Formats retrieved chunks as a synthetic `user` Content turn for
   * injection via the `BeforeModel` hook. Tagged with `<rag_context>`
   * for visibility in session recordings and debug logs.
   */
  /**
   * Sanitizes untrusted text by removing any occurrence of the closing tag
   * `</rag_context>` that could allow a malicious file to break out of the
   * context block and inject instructions into the LLM prompt.
   */
  private sanitizeForPrompt(text: string): string {
    // Strip the closing tag (case-insensitive) to prevent prompt injection.
    return text.replace(/<\/rag_context>/gi, '');
  }

  formatAsContent(chunks: ContentChunk[]): Content {
    const body = chunks
      .map(
        (c, i) =>
          `[${i + 1}] Source: ${c.source} (score: ${c.score.toFixed(3)})\n${this.sanitizeForPrompt(c.text)}`,
      )
      .join('\n\n---\n\n');

    return {
      role: 'user',
      parts: [
        {
          text: `<rag_context>\nThe following excerpts from the local workspace are provided as additional context. Use them to inform your response, but do not cite them explicitly unless asked.\n\n${body}\n</rag_context>`,
        },
      ],
    };
  }

  /**
   * Splits file text into overlapping chunks.
   * Target: ~512 tokens ≈ 2 048 chars at 4 chars/token.
   * Overlap:  ~64 tokens ≈   256 chars.
   */
  private async chunkFile(filePath: string): Promise<string[]> {
    const fs = await import('node:fs/promises');
    const text = await fs.readFile(filePath, 'utf-8');
    const CHUNK_SIZE = 2048;
    const OVERLAP = 256;
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start += CHUNK_SIZE - OVERLAP;
    }
    return chunks;
  }
}
