/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { WebSearchTool, type WebSearchToolParams } from './web-search.js';
import type { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import { ToolErrorType } from './tool-error.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

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
      get geminiClient() {
        return mockGeminiClient;
      },
      getProxy: () => undefined,
      generationConfigService: {
        getResolvedConfig: vi.fn().mockImplementation(({ model }) => ({
          model,
          sdkConfig: {},
        })),
      },
    } as unknown as Config;
    (
      mockConfigInstance as unknown as { config: Config; promptId: string }
    ).config = mockConfigInstance;
    (
      mockConfigInstance as unknown as { config: Config; promptId: string }
    ).promptId = 'test-prompt-id';
    mockGeminiClient = new GeminiClient(mockConfigInstance);
    tool = new WebSearchTool(mockConfigInstance, createMockMessageBus());
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      const result = await invocation.execute({ abortSignal });

      expect(result.llmContent).toBe(
        'Web search results for "successful query":\n\n<untrusted_context>\nHere are your results.\n</untrusted_context>',
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
      const result = await invocation.execute({ abortSignal });

      expect(result.llmContent).toBe(
        'No search results or information found for query: "no results query"',
      );
      expect(result.returnDisplay).toBe('No information found.');
    });

    it('should return a WEB_SEARCH_FAILED error on failure', async () => {
      const params: WebSearchToolParams = { query: 'error query' };
      const testError = new Error('API Failure');
      (mockGeminiClient.generateContent as Mock).mockRejectedValue(testError);

      const invocation = tool.build(params);
      const result = await invocation.execute({ abortSignal });

      expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
      expect(result.llmContent).toContain('Error:');
      expect(result.llmContent).toContain('API Failure');
      expect(result.returnDisplay).toBe('Error performing web search.');
    });

    it('should correctly format results with sources and citations wrapped in untrusted_context', async () => {
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
      const result = await invocation.execute({ abortSignal });

      const expectedLlmContent = `Web search results for "grounding query":

<untrusted_context>
This is a test[1] response.[1][2]

Sources:
[1] Example Site (https://example.com)
[2] Google (https://google.com)
</untrusted_context>`;

      expect(result.llmContent).toBe(expectedLlmContent);
      expect(result.returnDisplay).toBe(
        'Search results for "grounding query" returned.',
      );
      expect(result.sources).toHaveLength(2);
    });

    it('should insert markers at correct byte positions for multibyte text', async () => {
      const params: WebSearchToolParams = { query: 'multibyte query' };
      (mockGeminiClient.generateContent as Mock).mockResolvedValue({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'こんにちは! Gemini CLI✨️' }],
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
                {
                  web: {
                    title: 'Gemini CLI: your open-source AI agent',
                    uri: 'https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/',
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
                  groundingChunkIndices: [1, 2],
                },
              ],
            },
          },
        ],
      });

      const invocation = tool.build(params);
      const result = await invocation.execute({ abortSignal });

      const expectedLlmContent = `Web search results for "multibyte query":

<untrusted_context>
こんにちは![1] Gemini CLI✨️[2][3]

Sources:
[1] Japanese Greeting (https://example.test/japanese-greeting)
[2] google-gemini/gemini-cli (https://github.com/google-gemini/gemini-cli)
[3] Gemini CLI: your open-source AI agent (https://blog.google/technology/developers/introducing-gemini-cli-open-source-ai-agent/)
</untrusted_context>`;

      expect(result.llmContent).toBe(expectedLlmContent);
      expect(result.returnDisplay).toBe(
        'Search results for "multibyte query" returned.',
      );
      expect(result.sources).toHaveLength(3);
    });

    describe('time limit and cancellation', () => {
      const WEB_SEARCH_TIMEOUT_MS = 60_000;
      const neverSettles = () => new Promise<never>(() => {});

      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should return a timeout error when the search request never settles', async () => {
        const params: WebSearchToolParams = { query: 'stalled query' };
        // A request that never answers and ignores its abort signal.
        (mockGeminiClient.generateContent as Mock).mockImplementation(
          neverSettles,
        );

        const invocation = tool.build(params);
        const resultPromise = invocation.execute({ abortSignal });
        await vi.advanceTimersByTimeAsync(WEB_SEARCH_TIMEOUT_MS);
        const result = await resultPromise;

        expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
        expect(result.llmContent).toBe(
          `Error: Web search for query "stalled query" timed out after ${
            WEB_SEARCH_TIMEOUT_MS / 1000
          } seconds.`,
        );
        expect(result.returnDisplay).toBe('Web search timed out.');
        expect(vi.getTimerCount()).toBe(0);
      });

      it('should abort the underlying request when the time limit is reached', async () => {
        const params: WebSearchToolParams = { query: 'slow query' };
        (mockGeminiClient.generateContent as Mock).mockImplementation(
          neverSettles,
        );

        const invocation = tool.build(params);
        const resultPromise = invocation.execute({ abortSignal });
        const requestSignal = vi.mocked(mockGeminiClient.generateContent).mock
          .calls[0][2];

        await vi.advanceTimersByTimeAsync(WEB_SEARCH_TIMEOUT_MS - 1);
        expect(requestSignal.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        expect(requestSignal.aborted).toBe(true);
        await resultPromise;
      });

      it('should clean up timer and listener without aborting the request signal on success', async () => {
        const params: WebSearchToolParams = { query: 'fast query' };
        const controller = new AbortController();
        const addEventListener = vi.spyOn(
          controller.signal,
          'addEventListener',
        );
        const removeEventListener = vi.spyOn(
          controller.signal,
          'removeEventListener',
        );
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
        const result = await invocation.execute({
          abortSignal: controller.signal,
        });
        const requestSignal = vi.mocked(mockGeminiClient.generateContent).mock
          .calls[0][2];

        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toBe(
          'Search results for "fast query" returned.',
        );
        expect(requestSignal.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        expect(removeEventListener).toHaveBeenCalledWith(
          'abort',
          addEventListener.mock.calls[0][1],
        );
      });

      it('should clean up timer and listener without aborting the request signal on API error', async () => {
        const params: WebSearchToolParams = { query: 'failing query' };
        const controller = new AbortController();
        const addEventListener = vi.spyOn(
          controller.signal,
          'addEventListener',
        );
        const removeEventListener = vi.spyOn(
          controller.signal,
          'removeEventListener',
        );
        (mockGeminiClient.generateContent as Mock).mockRejectedValue(
          new Error('API failure'),
        );

        const invocation = tool.build(params);
        const result = await invocation.execute({
          abortSignal: controller.signal,
        });
        const requestSignal = vi.mocked(mockGeminiClient.generateContent).mock
          .calls[0][2];

        expect(result.error?.type).toBe(ToolErrorType.WEB_SEARCH_FAILED);
        expect(result.returnDisplay).toBe('Error performing web search.');
        expect(requestSignal.aborted).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        expect(removeEventListener).toHaveBeenCalledWith(
          'abort',
          addEventListener.mock.calls[0][1],
        );
      });

      it('should report a cancellation, not a timeout, when the user aborts', async () => {
        const params: WebSearchToolParams = { query: 'cancelled query' };
        const controller = new AbortController();
        (mockGeminiClient.generateContent as Mock).mockImplementation(
          neverSettles,
        );

        const invocation = tool.build(params);
        const resultPromise = invocation.execute({
          abortSignal: controller.signal,
        });
        controller.abort();
        const result = await resultPromise;

        expect(result.llmContent).toBe('Web search was cancelled.');
        expect(result.returnDisplay).toBe('Search cancelled.');
        expect(result.error).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
      });

      it('should prefer user cancellation when both the timeout and user abort fire', async () => {
        const params: WebSearchToolParams = { query: 'race query' };
        const controller = new AbortController();
        (mockGeminiClient.generateContent as Mock).mockImplementation(
          neverSettles,
        );

        const invocation = tool.build(params);
        const resultPromise = invocation.execute({
          abortSignal: controller.signal,
        });
        const requestSignal = vi.mocked(mockGeminiClient.generateContent).mock
          .calls[0][2];
        // Abort the caller signal in the same turn that the timeout aborts the request.
        requestSignal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });

        await vi.advanceTimersByTimeAsync(WEB_SEARCH_TIMEOUT_MS);
        const result = await resultPromise;

        expect(result.llmContent).toBe('Web search was cancelled.');
        expect(result.returnDisplay).toBe('Search cancelled.');
        expect(result.error).toBeUndefined();
        expect(vi.getTimerCount()).toBe(0);
      });

      it('should return cancelled immediately when the caller signal is already aborted', async () => {
        const params: WebSearchToolParams = { query: 'pre-aborted query' };
        const controller = new AbortController();
        controller.abort();

        const invocation = tool.build(params);
        const result = await invocation.execute({
          abortSignal: controller.signal,
        });

        expect(result.llmContent).toBe('Web search was cancelled.');
        expect(result.returnDisplay).toBe('Search cancelled.');
        expect(result.error).toBeUndefined();
        expect(mockGeminiClient.generateContent).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      });
    });
  });
});
