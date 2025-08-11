/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchTool } from './web-search.js';
import { Config } from '../config/config.js';

describe('WebSearchTool', () => {
  let webSearchTool: WebSearchTool;
  let mockConfig: Config;
  let mockGeminiClient: any;

  beforeEach(() => {
    mockGeminiClient = {
      generateContent: vi.fn(),
    };
    mockConfig = {
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
    } as any;
    webSearchTool = new WebSearchTool(mockConfig);
  });

  describe('byteIndexToCharIndex', () => {
    it('should handle ASCII text correctly', () => {
      const text = 'Hello world';
      // Access private method for testing
      const tool = webSearchTool as any;
      
      expect(tool.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, 5)).toBe(5);
      expect(tool.byteIndexToCharIndex(text, 11)).toBe(11);
      expect(tool.byteIndexToCharIndex(text, 100)).toBe(11); // Beyond end
    });

    it('should handle Japanese text with multibyte characters', () => {
      const text = 'こんにちは世界'; // "Hello world" in Japanese
      const tool = webSearchTool as any;
      
      // Each Japanese character is 3 bytes in UTF-8
      expect(tool.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, 3)).toBe(1);  // After first character
      expect(tool.byteIndexToCharIndex(text, 6)).toBe(2);  // After second character
      expect(tool.byteIndexToCharIndex(text, 9)).toBe(3);  // After third character
      expect(tool.byteIndexToCharIndex(text, 21)).toBe(7); // End of string
    });

    it('should handle mixed ASCII and multibyte characters', () => {
      const text = 'Hello 世界'; // "Hello world" mixed
      const tool = webSearchTool as any;
      
      expect(tool.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, 6)).toBe(6);  // After "Hello "
      expect(tool.byteIndexToCharIndex(text, 9)).toBe(7);  // After first Japanese char
      expect(tool.byteIndexToCharIndex(text, 12)).toBe(8); // End of string
    });

    it('should handle emoji characters', () => {
      const text = 'Hello 👋 world'; // Contains an emoji
      const tool = webSearchTool as any;
      
      expect(tool.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, 6)).toBe(6);  // After "Hello "
      expect(tool.byteIndexToCharIndex(text, 10)).toBe(8); // After emoji and space
    });

    it('should handle negative byte indices', () => {
      const text = 'Hello world';
      const tool = webSearchTool as any;
      
      expect(tool.byteIndexToCharIndex(text, -1)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, -10)).toBe(0);
    });

    it('should handle empty string', () => {
      const text = '';
      const tool = webSearchTool as any;
      
      expect(tool.byteIndexToCharIndex(text, 0)).toBe(0);
      expect(tool.byteIndexToCharIndex(text, 5)).toBe(0);
    });
  });

  describe('citation marker insertion', () => {
    it('should correctly position citations in Japanese text', async () => {
      const responseText = 'これは日本語のテストです。詳細情報があります。';
      
      mockGeminiClient.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: responseText }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Test Source', uri: 'https://example.com' } }
            ],
            groundingSupports: [
              {
                segment: { startIndex: 0, endIndex: 36 }, // Byte position after first sentence
                groundingChunkIndices: [0]
              }
            ]
          }
        }]
      });

      const result = await webSearchTool.execute(
        { query: 'Japanese test query' },
        new AbortController().signal
      );

      // Check that citation marker is inserted at the correct character position
      // Note: The citation is positioned based on the actual byte boundary from the API
      expect(result.llmContent).toContain('これは日本語のテストです[1]。詳細情報があります。');
    });

    it('should handle multiple citations in multibyte text', async () => {
      const responseText = '最初の文章です。二番目の文章です。三番目の文章です。';
      
      mockGeminiClient.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: responseText }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Source 1', uri: 'https://example1.com' } },
              { web: { title: 'Source 2', uri: 'https://example2.com' } }
            ],
            groundingSupports: [
              {
                segment: { startIndex: 0, endIndex: 24 }, // After first sentence
                groundingChunkIndices: [0]
              },
              {
                segment: { startIndex: 24, endIndex: 48 }, // After second sentence
                groundingChunkIndices: [1]
              }
            ]
          }
        }]
      });

      const result = await webSearchTool.execute(
        { query: 'Multiple citations test' },
        new AbortController().signal
      );

      // Verify both citations are positioned correctly
      expect(result.llmContent).toContain('最初の文章です。[1]二番目の文章です[2]。三番目の文章です。');
    });

    it('should handle mixed language content', async () => {
      const responseText = 'English text 日本語テキスト more English';
      
      mockGeminiClient.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: responseText }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Mixed Source', uri: 'https://example.com' } }
            ],
            groundingSupports: [
              {
                segment: { startIndex: 0, endIndex: 34 }, // After Japanese part
                groundingChunkIndices: [0]
              }
            ]
          }
        }]
      });

      const result = await webSearchTool.execute(
        { query: 'Mixed language test' },
        new AbortController().signal
      );

      // Citation should be positioned correctly between Japanese and English
      expect(result.llmContent).toContain('English text 日本語テキスト[1] more English');
    });
  });

  describe('validateParams', () => {
    it('should reject empty query', () => {
      const error = webSearchTool.validateParams({ query: '' });
      expect(error).toContain("The 'query' parameter cannot be empty");
    });

    it('should reject whitespace-only query', () => {
      const error = webSearchTool.validateParams({ query: '   ' });
      expect(error).toContain("The 'query' parameter cannot be empty");
    });

    it('should accept valid query', () => {
      const error = webSearchTool.validateParams({ query: 'valid query' });
      expect(error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockGeminiClient.generateContent.mockRejectedValue(new Error('API Error'));

      const result = await webSearchTool.execute(
        { query: 'test query' },
        new AbortController().signal
      );

      expect(result.llmContent).toContain('Error during web search');
      expect(result.returnDisplay).toContain('Error performing web search');
    });

    it('should handle empty response', async () => {
      mockGeminiClient.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: '' }] }
        }]
      });

      const result = await webSearchTool.execute(
        { query: 'test query' },
        new AbortController().signal
      );

      expect(result.llmContent).toContain('No search results or information found');
    });
  });
});