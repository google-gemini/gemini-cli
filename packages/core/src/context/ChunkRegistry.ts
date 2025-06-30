/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk } from './types.js';

/**
 * In-memory registry for conversation chunks with fast lookup and filtering.
 * Maintains insertion order and provides efficient access patterns.
 */
export class ChunkRegistry {
  private chunks: Map<string, ConversationChunk> = new Map();
  private orderedIds: string[] = [];

  /**
   * Add or update a chunk in the registry.
   */
  addChunk(chunk: ConversationChunk): void {
    const existed = this.chunks.has(chunk.id);
    this.chunks.set(chunk.id, chunk);
    
    if (!existed) {
      this.orderedIds.push(chunk.id);
    }
  }

  /**
   * Get a chunk by ID.
   */
  getChunk(id: string): ConversationChunk | undefined {
    return this.chunks.get(id);
  }

  /**
   * Remove a chunk by ID.
   * @returns true if chunk was removed, false if it didn't exist
   */
  removeChunk(id: string): boolean {
    const existed = this.chunks.has(id);
    if (existed) {
      this.chunks.delete(id);
      const index = this.orderedIds.indexOf(id);
      if (index > -1) {
        this.orderedIds.splice(index, 1);
      }
    }
    return existed;
  }

  /**
   * Get all chunks in insertion order.
   */
  getAllChunks(): ConversationChunk[] {
    return this.orderedIds
      .map(id => this.chunks.get(id))
      .filter((chunk): chunk is ConversationChunk => chunk !== undefined);
  }

  /**
   * Get chunks filtered by role.
   */
  getChunksByRole(role: 'user' | 'assistant' | 'tool'): ConversationChunk[] {
    return this.getAllChunks().filter(chunk => chunk.role === role);
  }

  /**
   * Get total token count across all chunks.
   */
  getTotalTokens(): number {
    return this.getAllChunks().reduce((total, chunk) => total + chunk.tokens, 0);
  }

  /**
   * Remove all chunks.
   */
  clear(): void {
    this.chunks.clear();
    this.orderedIds = [];
  }

  /**
   * Get number of chunks in registry.
   */
  size(): number {
    return this.chunks.size;
  }

  /**
   * Get chunks within a time range.
   */
  getChunksByTimeRange(startTime: number, endTime: number): ConversationChunk[] {
    return this.getAllChunks().filter(
      chunk => chunk.timestamp >= startTime && chunk.timestamp <= endTime
    );
  }

  /**
   * Get chunks with pinned metadata.
   */
  getPinnedChunks(): ConversationChunk[] {
    return this.getAllChunks().filter(chunk => chunk.metadata.pinned === true);
  }

  /**
   * Get chunks sorted by final score (descending).
   */
  getChunksByScore(): ConversationChunk[] {
    return this.getAllChunks()
      .filter(chunk => chunk.metadata.finalScore !== undefined)
      .sort((a, b) => (b.metadata.finalScore || 0) - (a.metadata.finalScore || 0));
  }
}