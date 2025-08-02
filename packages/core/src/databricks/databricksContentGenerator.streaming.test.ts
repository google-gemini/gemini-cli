/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabricksContentGenerator } from './databricksContentGenerator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import type { DatabricksConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DatabricksContentGenerator - Streaming', () => {
  let generator: DatabricksContentGenerator;
  let config: DatabricksConfig;

  // Helper function to create GenerateContentParameters
  function createRequest(options: {
    prompt: string;
    model: string;
    temperature?: number;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
  }): GenerateContentParameters {
    return {
      model: options.model,
      contents: [
        {
          role: 'user',
          parts: [{ text: options.prompt }],
        },
      ],
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        abortSignal: options.abortSignal,
      },
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();

    config = {
      workspace_host: 'https://dbc-test.cloud.databricks.com',
      auth_token: 'dapi-test-token',
      model: 'databricks-dbrx-instruct',
    };

    generator = new DatabricksContentGenerator(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Stream Response Handling', () => {
    function createMockStream(chunks: string[]): ReadableStream {
      let chunkIndex = 0;
      const encoder = new TextEncoder();

      return new ReadableStream({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(encoder.encode(chunks[chunkIndex]));
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });
    }

    it('should handle streaming responses', async () => {
      const request = createRequest({
        prompt: 'Tell me a story',
        model: 'databricks-dbrx-instruct',
      });

      // Create a mock ReadableStream for SSE data
      const sseChunks = [
        'data: {"id":"1","choices":[{"delta":{"content":"Once"},"index":0}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":" upon"},"index":0}]}\n\n',
        'data: {"id":"3","choices":[{"delta":{"content":" a"},"index":0}]}\n\n',
        'data: {"id":"4","choices":[{"delta":{"content":" time"},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":4,"total_tokens":8}}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(sseChunks),
        headers: new Headers({
          'content-type': 'text/event-stream',
        }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');
      const chunks: GenerateContentResponse[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Verify chunks were transformed correctly
      expect(chunks).toHaveLength(4);

      // First chunk
      expect(chunks[0]).toMatchObject({
        candidates: [
          {
            content: {
              parts: [{ text: 'Once' }],
              role: 'model',
            },
            index: 0,
          },
        ],
      });

      // Second chunk
      expect(chunks[1]).toMatchObject({
        candidates: [
          {
            content: {
              parts: [{ text: ' upon' }],
              role: 'model',
            },
            index: 0,
          },
        ],
      });

      // Third chunk
      expect(chunks[2]).toMatchObject({
        candidates: [
          {
            content: {
              parts: [{ text: ' a' }],
              role: 'model',
            },
            index: 0,
          },
        ],
      });

      // Final chunk with finish reason and usage
      expect(chunks[3]).toMatchObject({
        candidates: [
          {
            content: {
              parts: [{ text: ' time' }],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 4,
          candidatesTokenCount: 4,
          totalTokenCount: 8,
        },
      });
    });

    it('should handle streaming errors', async () => {
      const request = createRequest({
        prompt: 'Test error',
        model: 'databricks-dbrx-instruct',
      });

      // Create a stream that errors after yielding one chunk
      const errorStream = new ReadableStream({
        async pull(controller) {
          // First pull: enqueue data
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"id":"1","choices":[{"delta":{"content":"Hello"},"index":0}]}\n\n',
            ),
          );
          // Allow the chunk to be processed
          await new Promise((resolve) => setTimeout(resolve, 0));
          // Then error
          controller.error(new Error('Stream connection lost'));
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: errorStream,
        headers: new Headers({
          'content-type': 'text/event-stream',
        }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');
      const chunks: GenerateContentResponse[] = [];
      let error: Error | null = null;

      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();
      expect(error?.message).toBe('Stream connection lost');
      // Should have received one chunk before error
      expect(chunks).toHaveLength(1);
      expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Hello',
      );
    });

    it('should handle empty stream chunks', async () => {
      const request = createRequest({
        prompt: 'Test',
        model: 'databricks-dbrx-instruct',
      });

      const sseChunks = [
        '\n\n', // Empty lines
        'data: \n\n', // Empty data
        'data: invalid-json\n\n', // Invalid JSON
        'data: {"id":"1","choices":[{"delta":{"content":"Valid"},"index":0}]}\n\n', // Valid chunk
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(sseChunks),
        headers: new Headers({
          'content-type': 'text/event-stream',
        }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');
      const chunks: GenerateContentResponse[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should only have one valid chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Valid',
      );
    });

    it('should handle multi-line content in streaming', async () => {
      const request = createRequest({
        prompt: 'Write a poem',
        model: 'databricks-dbrx-instruct',
      });

      const sseChunks = [
        'data: {"id":"1","choices":[{"delta":{"content":"Roses are red\\n"},"index":0}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":"Violets are blue\\n"},"index":0}]}\n\n',
        'data: {"id":"3","choices":[{"delta":{"content":"Sugar is sweet\\n"},"index":0}]}\n\n',
        'data: {"id":"4","choices":[{"delta":{"content":"And so are you"},"index":0,"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(sseChunks),
        headers: new Headers({
          'content-type': 'text/event-stream',
        }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');
      const chunks: GenerateContentResponse[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4);
      expect(chunks[0].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Roses are red\n',
      );
      expect(chunks[1].candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Violets are blue\n',
      );
    });

    it('should properly close stream on abort signal', async () => {
      const controller = new AbortController();
      const request = createRequest({
        prompt: 'Long response',
        model: 'databricks-dbrx-instruct',
        abortSignal: controller.signal,
      });

      let pullCount = 0;

      const abortableStream = new ReadableStream({
        pull(streamController) {
          pullCount++;
          if (pullCount === 1) {
            streamController.enqueue(
              new TextEncoder().encode(
                'data: {"id":"1","choices":[{"delta":{"content":"Start"},"index":0}]}\n\n',
              ),
            );
          } else if (pullCount === 2) {
            // Simulate abort during stream
            controller.abort();
            streamController.close();
          }
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: abortableStream,
        headers: new Headers({
          'content-type': 'text/event-stream',
        }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');
      const chunks: GenerateContentResponse[] = [];

      try {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      } catch (e) {
        expect((e as Error).name).toBe('AbortError');
      }

      // Should only have received first chunk
      expect(chunks.length).toBeLessThanOrEqual(1);
    });

    it('should transform streaming request with proper parameters', async () => {
      const request = createRequest({
        prompt: 'Stream test',
        model: 'databricks-dbrx-instruct',
        temperature: 0.5,
        maxOutputTokens: 100,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockStream(['data: [DONE]\n\n']),
        headers: new Headers({ 'content-type': 'text/event-stream' }),
      } as Response);

      const stream = await generator.generateContentStream(request, 'test-id');

      // Consume the stream to trigger the fetch
      for await (const _chunk of stream) {
        // Just consume, we're only checking the request
        break;
      }

      // Verify the request was transformed correctly
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/serving-endpoints/databricks-dbrx-instruct/invocations',
        ),
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer dapi-test-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Stream test' }],
            max_tokens: 100,
            temperature: 0.5,
            stream: true, // Should be true for streaming
          }),
          signal: undefined,
        },
      );
    });
  });
});
