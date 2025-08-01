/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepSeekContentGenerator } from './deepseekContentGenerator.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('DeepSeekContentGenerator', () => {
  let generator: DeepSeekContentGenerator;
  const mockApiKey = 'test-api-key';
  const mockModel = 'test-model';

  beforeEach(() => {
    generator = new DeepSeekContentGenerator(mockApiKey, mockModel);
    vi.resetAllMocks();
  });

  describe('generateContent', () => {
    it('should convert Gemini format to DeepSeek format and back', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello, world!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request = {
        model: 'deepseek-chat',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 100
        }
      };

      const result = await generator.generateContent(request);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockApiKey}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false,
            temperature: 0.7,
            max_tokens: 100
          })
        })
      );

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates![0]?.content?.parts?.[0]?.text).toBe('Hello, world!');
      expect(result.usageMetadata?.totalTokenCount).toBe(15);
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key')
      });

      const request = {
        model: 'deepseek-chat',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        'DeepSeek API error: 401 Unauthorized - Invalid API key'
      );
    });

    it('should handle streaming responses with incremental content', async () => {
      // Mock ReadableStream for streaming response
      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n',
        'data: [DONE]\n'
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn().mockImplementation(() => {
          if (chunkIndex < mockChunks.length) {
            const chunk = mockChunks[chunkIndex++];
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(chunk)
            });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
        releaseLock: vi.fn()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      const request = {
        model: 'deepseek-chat',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      const streamGenerator = await generator.generateContentStream(request);
      const results = [];

      for await (const response of streamGenerator) {
        results.push(response.candidates![0]?.content?.parts?.[0]?.text);
      }

      // Should receive incremental content, not accumulated
      expect(results).toEqual(['Hello', ' world', '!']);
    });
  });

  describe('countTokens', () => {
    it('should estimate token count based on text length', async () => {
      const request = {
        model: 'deepseek-chat',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'This is a test message' }]
          }
        ]
      };

      const result = await generator.countTokens(request);

      // "This is a test message" has 22 characters, so estimated tokens should be ceil(22/4) = 6
      expect(result.totalTokens).toBe(6);
    });
  });

  describe('embedContent', () => {
    it('should throw an error since DeepSeek does not support embeddings', async () => {
      const request = {
        model: 'deepseek-chat',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      await expect(generator.embedContent(request)).rejects.toThrow(
        'DeepSeek does not support embeddings. Please use Gemini for embedding operations.'
      );
    });
  });
});
