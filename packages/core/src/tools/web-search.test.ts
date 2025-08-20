/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { WebSearchTool, WebSearchToolParams } from './web-search.js';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');
vi.mock('../config/config.js');

describe('WebSearchTool', () => {
  const abortSignal = new AbortController().signal;
  let mockGeminiClient: GeminiClient;
  let tool: WebSearchTool;

  beforeEach(() => {
    const mockConfigInstance = {
      getGeminiClient: () => mockGeminiClient,
      getProxy: () => undefined,
    } as unknown as Config;
    mockGeminiClient = new GeminiClient(mockConfigInstance);
    tool = new WebSearchTool(mockConfigInstance);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('byteIndexToCharIndex', () => {
    it('should handle ASCII text correctly', () => {
      const text = 'Hello world';
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      // Access private method for testing
      const invocationAny = invocation as any;

      expect(invocationAny.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, 5)).toBe(5);
      expect(invocationAny.byteIndexToCharIndex(text, 11)).toBe(11);
      expect(invocationAny.byteIndexToCharIndex(text, 100)).toBe(11); // Beyond end
    });

    it('should handle Japanese text with multibyte characters', () => {
      const text = 'こんにちは世界'; // "Hello world" in Japanese
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      const invocationAny = invocation as any;

      // Each Japanese character is 3 bytes in UTF-8
      expect(invocationAny.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, 3)).toBe(1); // After first character
      expect(invocationAny.byteIndexToCharIndex(text, 6)).toBe(2); // After second character
      expect(invocationAny.byteIndexToCharIndex(text, 9)).toBe(3); // After third character
      expect(invocationAny.byteIndexToCharIndex(text, 21)).toBe(7); // End of string
    });

    it('should handle mixed ASCII and multibyte characters', () => {
      const text = 'Hello 世界'; // "Hello world" mixed
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      const invocationAny = invocation as any;

      expect(invocationAny.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, 6)).toBe(6); // After "Hello "
      expect(invocationAny.byteIndexToCharIndex(text, 9)).toBe(7); // After first Japanese char
      expect(invocationAny.byteIndexToCharIndex(text, 12)).toBe(8); // End of string
    });

    it('should handle emoji characters', () => {
      const text = 'Hello 👋 world'; // Contains an emoji
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      const invocationAny = invocation as any;

      expect(invocationAny.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, 6)).toBe(6); // After "Hello "
      expect(invocationAny.byteIndexToCharIndex(text, 10)).toBe(8); // After emoji and space
    });

    it('should handle negative byte indices', () => {
      const text = 'Hello world';
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      const invocationAny = invocation as any;

      expect(invocationAny.byteIndexToCharIndex(text, -1)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, -10)).toBe(0);
    });

    it('should handle empty string', () => {
      const text = '';
      const params: WebSearchToolParams = { query: 'test' };
      const invocation = tool.build(params);
      const invocationAny = invocation as any;

      expect(invocationAny.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(invocationAny.byteIndexToCharIndex(text, 5)).toBe(0);
    });
  });

  describe('citation marker insertion', () => {
    it('should correctly position citations in Japanese text', async () => {
      const responseText = 'これは日本語のテストです。詳細情報があります。';
      const params: WebSearchToolParams = { query: 'Japanese test query' };

      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: { parts: [{ text: responseText }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Test Source', uri: 'https://example.com' } },
              ],
              groundingSupports: [
                {
                  segment: { startIndex: 0, endIndex: 36 }, // Byte position after first sentence
                  groundingChunkIndices: [0],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      // Check that citation marker is inserted at the correct character position
      // Note: The citation is positioned based on the actual byte boundary from the API
      expect(result.llmContent).toContain(
        'これは日本語のテストです[1]。詳細情報があります。',
      );
    });

    it('should handle multiple citations in multibyte text', async () => {
      const responseText =
        '最初の文章です。二番目の文章です。三番目の文章です。';
      const params: WebSearchToolParams = { query: 'Multiple citations test' };

      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: { parts: [{ text: responseText }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Source 1', uri: 'https://example1.com' } },
                { web: { title: 'Source 2', uri: 'https://example2.com' } },
              ],
              groundingSupports: [
                {
                  segment: { startIndex: 0, endIndex: 24 }, // After first sentence
                  groundingChunkIndices: [0],
                },
                {
                  segment: { startIndex: 24, endIndex: 48 }, // After second sentence
                  groundingChunkIndices: [1],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      // Verify both citations are positioned correctly
      expect(result.llmContent).toContain(
        '最初の文章です。[1]二番目の文章です[2]。三番目の文章です。',
      );
    });

    it('should handle mixed language content', async () => {
      const responseText = 'English text 日本語テキスト more English';
      const params: WebSearchToolParams = { query: 'Mixed language test' };

      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: { parts: [{ text: responseText }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { title: 'Mixed Source', uri: 'https://example.com' } },
              ],
              groundingSupports: [
                {
                  segment: { startIndex: 0, endIndex: 34 }, // After Japanese part
                  groundingChunkIndices: [0],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      // Citation should be positioned correctly between Japanese and English
      expect(result.llmContent).toContain(
        'English text 日本語テキスト[1] more English',
      );
    });
  });

  describe('build', () => {
    it('should return an invocation for a valid query', () => {
      const params: WebSearchToolParams = { query: 'test query' };
      const invocation = tool.build(params);
      expect(invocation).toBeDefined();
      expect(invocation.params).toEqual(params);
    });

    it('should throw an error for an empty query', () => {
      const params: WebSearchToolParams = { query: '' };
      expect(() => tool.build(params)).toThrow(
        "The 'query' parameter cannot be empty.",
      );
    });

    it('should throw an error for a query with only whitespace', () => {
      const params: WebSearchToolParams = { query: '   ' };
      expect(() => tool.build(params)).toThrow(
        "The 'query' parameter cannot be empty.",
      );
    });
  });

  describe('getDescription', () => {
    it('should return a description of the search', () => {
      const params: WebSearchToolParams = { query: 'test query' };
      const invocation = tool.build(params);
      expect(invocation.getDescription()).toBe(
        'Searching the web for: "test query"',
      );
    });
  });

  describe('execute', () => {
    it('should return search results for a successful query', async () => {
      const params: WebSearchToolParams = { query: 'successful query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Here are your results.' }],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toBe(
        'Web search results for "successful query":\n\nHere are your results.',
      );
      expect(result.returnDisplay).toBe(
        'Search results for "successful query" returned.',
      );
      expect(result.sources).toBeUndefined();
    });

    it('should handle no search results found', async () => {
      const params: WebSearchToolParams = { query: 'no results query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: '' }],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toBe(
        'No search results or information found for query: "no results query"',
      );
      expect(result.returnDisplay).toBe('No information found.');
    });

    it('should handle API errors gracefully', async () => {
      const params: WebSearchToolParams = { query: 'error query' };
      const testError = new Error('API Failure');
      (mockGeminiClient.generateContent as Mock).mockRejectedValue(testError);

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Error:');
      expect(result.llmContent).toContain('API Failure');
      expect(result.returnDisplay).toBe('Error performing web search.');
    });

    it('should correctly format results with sources and citations', async () => {
      const params: WebSearchToolParams = { query: 'grounding query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'This is a test response.' }],
            },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://example.com', title: 'Example Site' } },
                { web: { uri: 'https://google.com', title: 'Google' } },
              ],
              groundingSupports: [
                {
                  segment: { startIndex: 5, endIndex: 14 },
                  groundingChunkIndices: [0],
                },
                {
                  segment: { startIndex: 15, endIndex: 24 },
                  groundingChunkIndices: [0, 1],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute(abortSignal);

      const expectedLlmContent = `Web search results for "grounding query":

This is a test[1] response.[1][2]

Sources:
[1] Example Site (https://example.com)
[2] Google (https://google.com)`;

      expect(result.llmContent).toBe(expectedLlmContent);
      expect(result.returnDisplay).toBe(
        'Search results for "grounding query" returned.',
      );
      expect(result.sources).toHaveLength(2);
    });
  });
});
