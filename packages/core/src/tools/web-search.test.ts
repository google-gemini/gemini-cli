/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { WebSearchTool } from './web-search.js';
import { Config } from '../config/config.js';
import type { GenerateContentResponse } from '@google/genai';

describe('WebSearchTool', () => {
  const mockGeminiClient = {
    generateContent: vi.fn(),
  };
  const mockConfig = {
    getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
  } as unknown as Config;
  const abortSignal = new AbortController().signal;

  describe('execute', () => {
    it('should return search results with citation markers and sources', async () => {
      const tool = new WebSearchTool(mockConfig);

      const mockResponse: Partial<GenerateContentResponse> = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This is a test search result.',
                },
              ],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    title: 'Page1',
                    uri: 'https://example.test/page1',
                  },
                },
                {
                  web: {
                    title: 'Page2',
                    uri: 'https://example.test/page2',
                  },
                },
              ],
              groundingSupports: [
                {
                  segment: {
                    // Byte range of "This"
                    startIndex: 0,
                    endIndex: 4,
                  },
                  groundingChunkIndices: [0],
                },
                {
                  segment: {
                    // Byte range of "test search result."
                    startIndex: 10,
                    endIndex: 29,
                  },
                  groundingChunkIndices: [1],
                },
              ],
            },
          },
        ],
      };
      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const result = await tool.execute({ query: 'test search' }, abortSignal);

      expect(result.llmContent).toContain(
        'This[1] is a test search result.[2]',
      );
      expect(result.llmContent).toContain('Sources:');
      expect(result.llmContent).toContain(
        '[1] Page1 (https://example.test/page1)',
      );
      expect(result.llmContent).toContain(
        '[2] Page2 (https://example.test/page2)',
      );
      expect(result.sources).toHaveLength(2);
    });

    it('should insert markers at correct byte positions for multibyte text', async () => {
      const tool = new WebSearchTool(mockConfig);

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'こんにちは! Gemini CLI✨️',
                },
              ],
            },
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    title: 'Japanese Greeting',
                    uri: 'https://example.test/japanese-greeting',
                  },
                },
                {
                  web: {
                    title: 'google-gemini/gemini-cli',
                    uri: 'https://github.com/google-gemini/gemini-cli',
                  },
                },
              ],
              groundingSupports: [
                {
                  segment: {
                    // Byte range of "こんにちは!" (utf-8 encoded)
                    startIndex: 0,
                    endIndex: 16,
                  },
                  groundingChunkIndices: [0],
                },
                {
                  segment: {
                    // Byte range of "Gemini CLI✨️" (utf-8 encoded)
                    startIndex: 17,
                    endIndex: 33,
                  },
                  groundingChunkIndices: [1],
                },
              ],
            },
          },
        ],
      };

      mockGeminiClient.generateContent.mockResolvedValue(mockResponse);

      const result = await tool.execute(
        { query: 'search response with multibyte characters' },
        abortSignal,
      );
      expect(result.llmContent).toContain('こんにちは![1] Gemini CLI✨️[2]');
    });
  });
});
