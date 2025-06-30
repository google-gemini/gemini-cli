/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConversationChunk } from './types.js';

/**
 * Node in the doubly-linked list for maintaining insertion order.
 */
interface ChunkNode {
  chunk: ConversationChunk;
  prev: ChunkNode | null;
  next: ChunkNode | null;
}

/**
 * In-memory registry for conversation chunks with fast lookup and filtering.
 * Maintains insertion order using a doubly-linked list for O(1) operations.
 * Provides efficient access patterns for large-scale chunk management.
 */
export class ChunkRegistry {
  private chunks: Map<string, ChunkNode> = new Map();
  private head: ChunkNode | null = null;
  private tail: ChunkNode | null = null;
  private _size: number = 0;

  /**
   * Add or update a chunk in the registry.
   * O(1) time complexity for both new additions and updates.
   */
  addChunk(chunk: ConversationChunk): void {
    const existingNode = this.chunks.get(chunk.id);
    
    if (existingNode) {
      // Update existing chunk in-place without changing position
      existingNode.chunk = chunk;
    } else {
      // Create new node and add to tail
      const newNode: ChunkNode = {
        chunk,
        prev: this.tail,
        next: null,
      };
      
      this.chunks.set(chunk.id, newNode);
      
      if (this.tail) {
        this.tail.next = newNode;
        this.tail = newNode;
      } else {
        // First node
        this.head = newNode;
        this.tail = newNode;
      }
      
      this._size++;
    }
  }

  /**
   * Get a chunk by ID.
   * O(1) time complexity.
   */
  getChunk(id: string): ConversationChunk | undefined {
    const node = this.chunks.get(id);
    return node?.chunk;
  }

  /**
   * Remove a chunk by ID.
   * O(1) time complexity using node references.
   * @returns true if chunk was removed, false if it didn't exist
   */
  removeChunk(id: string): boolean {
    const node = this.chunks.get(id);
    if (!node) {
      return false;
    }
    
    // Remove from linked list
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Removing head
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Removing tail
      this.tail = node.prev;
    }
    
    // Remove from map
    this.chunks.delete(id);
    this._size--;
    
    return true;
  }

  /**
   * Get all chunks in insertion order.
   * O(n) time complexity, maintains insertion order via linked list traversal.
   */
  getAllChunks(): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    let current = this.head;
    
    while (current) {
      chunks.push(current.chunk);
      current = current.next;
    }
    
    return chunks;
  }

  /**
   * Get chunks filtered by role.
   * O(n) time complexity, but efficient traversal.
   */
  getChunksByRole(role: 'user' | 'assistant' | 'tool'): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    let current = this.head;
    
    while (current) {
      if (current.chunk.role === role) {
        chunks.push(current.chunk);
      }
      current = current.next;
    }
    
    return chunks;
  }

  /**
   * Get total token count across all chunks.
   * O(n) time complexity, optimized traversal.
   */
  getTotalTokens(): number {
    let total = 0;
    let current = this.head;
    
    while (current) {
      total += current.chunk.tokens;
      current = current.next;
    }
    
    return total;
  }

  /**
   * Remove all chunks.
   * O(1) time complexity.
   */
  clear(): void {
    this.chunks.clear();
    this.head = null;
    this.tail = null;
    this._size = 0;
  }

  /**
   * Get number of chunks in registry.
   * O(1) time complexity.
   */
  size(): number {
    return this._size;
  }

  /**
   * Get chunks within a time range.
   * O(n) time complexity, optimized traversal.
   */
  getChunksByTimeRange(startTime: number, endTime: number): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    let current = this.head;
    
    while (current) {
      if (current.chunk.timestamp >= startTime && current.chunk.timestamp <= endTime) {
        chunks.push(current.chunk);
      }
      current = current.next;
    }
    
    return chunks;
  }

  /**
   * Get chunks with pinned metadata.
   * O(n) time complexity, optimized traversal.
   */
  getPinnedChunks(): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    let current = this.head;
    
    while (current) {
      if (current.chunk.metadata.pinned === true) {
        chunks.push(current.chunk);
      }
      current = current.next;
    }
    
    return chunks;
  }

  /**
   * Get chunks sorted by final score (descending).
   * O(n log n) time complexity due to sorting, but optimized collection.
   */
  getChunksByScore(): ConversationChunk[] {
    const chunks: ConversationChunk[] = [];
    let current = this.head;
    
    while (current) {
      if (current.chunk.metadata.finalScore !== undefined) {
        chunks.push(current.chunk);
      }
      current = current.next;
    }
    
    return chunks.sort((a, b) => (b.metadata.finalScore || 0) - (a.metadata.finalScore || 0));
  }
}