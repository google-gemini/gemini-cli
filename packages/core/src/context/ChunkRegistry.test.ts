/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ConversationChunk } from './types.js';
import { ChunkRegistry } from './ChunkRegistry.js';

describe('ChunkRegistry', () => {
  let registry: ChunkRegistry;

  beforeEach(() => {
    registry = new ChunkRegistry();
  });

  describe('addChunk', () => {
    it('should add a new chunk', () => {
      const chunk: ConversationChunk = {
        id: 'test-1',
        role: 'user',
        content: 'Hello world',
        tokens: 5,
        timestamp: Date.now(),
        metadata: {},
      };

      registry.addChunk(chunk);
      expect(registry.getChunk('test-1')).toEqual(chunk);
    });

    it('should update existing chunk', () => {
      const originalChunk: ConversationChunk = {
        id: 'test-1',
        role: 'user',
        content: 'Hello',
        tokens: 2,
        timestamp: Date.now(),
        metadata: {},
      };

      const updatedChunk: ConversationChunk = {
        ...originalChunk,
        content: 'Hello world',
        tokens: 5,
        metadata: { finalScore: 0.8 },
      };

      registry.addChunk(originalChunk);
      registry.addChunk(updatedChunk);

      const retrieved = registry.getChunk('test-1');
      expect(retrieved?.content).toBe('Hello world');
      expect(retrieved?.tokens).toBe(5);
      expect(retrieved?.metadata.finalScore).toBe(0.8);
    });

    it('should maintain insertion order', () => {
      const chunk1: ConversationChunk = {
        id: 'first',
        role: 'user',
        content: 'First',
        tokens: 2,
        timestamp: 1,
        metadata: {},
      };

      const chunk2: ConversationChunk = {
        id: 'second',
        role: 'assistant',
        content: 'Second',
        tokens: 3,
        timestamp: 2,
        metadata: {},
      };

      registry.addChunk(chunk1);
      registry.addChunk(chunk2);

      const chunks = registry.getAllChunks();
      expect(chunks[0].id).toBe('first');
      expect(chunks[1].id).toBe('second');
    });
  });

  describe('getChunk', () => {
    it('should return undefined for non-existent chunk', () => {
      expect(registry.getChunk('non-existent')).toBeUndefined();
    });

    it('should return correct chunk by id', () => {
      const chunk: ConversationChunk = {
        id: 'test-1',
        role: 'user',
        content: 'Test content',
        tokens: 10,
        timestamp: Date.now(),
        metadata: {},
      };

      registry.addChunk(chunk);
      expect(registry.getChunk('test-1')).toEqual(chunk);
    });
  });

  describe('removeChunk', () => {
    it('should remove existing chunk', () => {
      const chunk: ConversationChunk = {
        id: 'test-1',
        role: 'user',
        content: 'To be removed',
        tokens: 5,
        timestamp: Date.now(),
        metadata: {},
      };

      registry.addChunk(chunk);
      expect(registry.getChunk('test-1')).toEqual(chunk);

      const removed = registry.removeChunk('test-1');
      expect(removed).toBe(true);
      expect(registry.getChunk('test-1')).toBeUndefined();
    });

    it('should return false for non-existent chunk', () => {
      expect(registry.removeChunk('non-existent')).toBe(false);
    });
  });

  describe('getAllChunks', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.getAllChunks()).toEqual([]);
    });

    it('should return all chunks in order', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'First',
          tokens: 2,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Second',
          tokens: 3,
          timestamp: 2,
          metadata: {},
        },
        {
          id: '3',
          role: 'tool',
          content: 'Third',
          tokens: 4,
          timestamp: 3,
          metadata: {},
        },
      ];

      chunks.forEach(chunk => registry.addChunk(chunk));
      const retrieved = registry.getAllChunks();

      expect(retrieved).toHaveLength(3);
      expect(retrieved.map(c => c.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('getChunksByRole', () => {
    beforeEach(() => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'User message 1',
          tokens: 5,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Assistant response',
          tokens: 6,
          timestamp: 2,
          metadata: {},
        },
        {
          id: '3',
          role: 'user',
          content: 'User message 2',
          tokens: 5,
          timestamp: 3,
          metadata: {},
        },
        {
          id: '4',
          role: 'tool',
          content: 'Tool output',
          tokens: 8,
          timestamp: 4,
          metadata: {},
        },
      ];

      chunks.forEach(chunk => registry.addChunk(chunk));
    });

    it('should return chunks filtered by role', () => {
      const userChunks = registry.getChunksByRole('user');
      expect(userChunks).toHaveLength(2);
      expect(userChunks.map(c => c.id)).toEqual(['1', '3']);

      const assistantChunks = registry.getChunksByRole('assistant');
      expect(assistantChunks).toHaveLength(1);
      expect(assistantChunks[0].id).toBe('2');

      const toolChunks = registry.getChunksByRole('tool');
      expect(toolChunks).toHaveLength(1);
      expect(toolChunks[0].id).toBe('4');
    });
  });

  describe('getTotalTokens', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.getTotalTokens()).toBe(0);
    });

    it('should sum all chunk tokens', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          tokens: 10,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Response',
          tokens: 25,
          timestamp: 2,
          metadata: {},
        },
        {
          id: '3',
          role: 'tool',
          content: 'Output',
          tokens: 15,
          timestamp: 3,
          metadata: {},
        },
      ];

      chunks.forEach(chunk => registry.addChunk(chunk));
      expect(registry.getTotalTokens()).toBe(50);
    });

    it('should update when chunks are added or removed', () => {
      const chunk1: ConversationChunk = {
        id: '1',
        role: 'user',
        content: 'Test',
        tokens: 10,
        timestamp: 1,
        metadata: {},
      };

      const chunk2: ConversationChunk = {
        id: '2',
        role: 'assistant',
        content: 'Response',
        tokens: 20,
        timestamp: 2,
        metadata: {},
      };

      registry.addChunk(chunk1);
      expect(registry.getTotalTokens()).toBe(10);

      registry.addChunk(chunk2);
      expect(registry.getTotalTokens()).toBe(30);

      registry.removeChunk('1');
      expect(registry.getTotalTokens()).toBe(20);
    });
  });

  describe('clear', () => {
    it('should remove all chunks', () => {
      const chunks: ConversationChunk[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test 1',
          tokens: 5,
          timestamp: 1,
          metadata: {},
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Test 2',
          tokens: 7,
          timestamp: 2,
          metadata: {},
        },
      ];

      chunks.forEach(chunk => registry.addChunk(chunk));
      expect(registry.getAllChunks()).toHaveLength(2);
      expect(registry.getTotalTokens()).toBe(12);

      registry.clear();
      expect(registry.getAllChunks()).toHaveLength(0);
      expect(registry.getTotalTokens()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return number of chunks', () => {
      expect(registry.size()).toBe(0);

      registry.addChunk({
        id: '1',
        role: 'user',
        content: 'Test',
        tokens: 5,
        timestamp: 1,
        metadata: {},
      });
      expect(registry.size()).toBe(1);

      registry.addChunk({
        id: '2',
        role: 'assistant',
        content: 'Response',
        tokens: 7,
        timestamp: 2,
        metadata: {},
      });
      expect(registry.size()).toBe(2);

      registry.removeChunk('1');
      expect(registry.size()).toBe(1);
    });
  });
});