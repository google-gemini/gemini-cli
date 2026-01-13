/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const logApiRequest = vi.hoisted(() => vi.fn());
const logApiResponse = vi.hoisted(() => vi.fn());
const logApiError = vi.hoisted(() => vi.fn());

vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest,
  logApiResponse,
  logApiError,
}));

const runInDevTraceSpan = vi.hoisted(() =>
  vi.fn(async (meta, fn) => fn({ metadata: {}, endSpan: vi.fn() })),
);

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  GenerateContentResponse,
  EmbedContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import type { Config } from '../config/config.js';
import { ApiRequestEvent } from '../telemetry/types.js';

describe('LoggingContentGenerator', () => {
  let wrapped: ContentGenerator;
  let config: Config;
  let loggingContentGenerator: LoggingContentGenerator;

  beforeEach(() => {
    wrapped = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    config = {
      getGoogleAIConfig: vi.fn(),
      getVertexAIConfig: vi.fn(),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'API_KEY',
      }),
    } as unknown as Config;
    loggingContentGenerator = new LoggingContentGenerator(wrapped, config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('generateContent', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response: GenerateContentResponse = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
        text: undefined,
        functionCalls: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
        data: undefined,
      };
      vi.mocked(wrapped.generateContent).mockResolvedValue(response);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await promise;

      expect(wrapped.generateContent).toHaveBeenCalledWith(req, userPromptId);
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');
      vi.mocked(wrapped.generateContent).mockRejectedValue(error);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      } as unknown as GenerateContentResponse;

      async function* createAsyncGenerator() {
        yield response;
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      for await (const _ of stream) {
        // consume stream
      }

      expect(wrapped.generateContentStream).toHaveBeenCalledWith(
        req,
        userPromptId,
      );
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');

      async function* createAsyncGenerator() {
        yield Promise.reject(error);
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await expect(async () => {
        for await (const _ of stream) {
          // do nothing
        }
      }).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });

    it('should set latest API request in config for main agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Main agent prompt IDs end with exactly 8 hashes and a turn counter
      const mainAgentPromptId = 'session-uuid########1';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        mainAgentPromptId,
      );

      expect(config.setLatestApiRequest).toHaveBeenCalledWith(req);
    });

    it('should NOT set latest API request in config for sub-agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Sub-agent prompt IDs contain fewer hashes, typically separating the agent name and ID
      const subAgentPromptId = 'codebase_investigator#12345';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        subAgentPromptId,
      );

      expect(config.setLatestApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('getWrapped', () => {
    it('should return the wrapped content generator', () => {
      expect(loggingContentGenerator.getWrapped()).toBe(wrapped);
    });
  });

  describe('countTokens', () => {
    it('should call the wrapped countTokens method', async () => {
      const req = { contents: [], model: 'gemini-pro' };
      const response = { totalTokens: 10 };
      vi.mocked(wrapped.countTokens).mockResolvedValue(response);

      const result = await loggingContentGenerator.countTokens(req);

      expect(wrapped.countTokens).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });

  describe('embedContent', () => {
    it('should call the wrapped embedContent method', async () => {
      const req = {
        contents: [{ role: 'user', parts: [] }],
        model: 'gemini-pro',
      };
      const response: EmbedContentResponse = { embeddings: [{ values: [] }] };
      vi.mocked(wrapped.embedContent).mockResolvedValue(response);

      const result = await loggingContentGenerator.embedContent(req);

      expect(wrapped.embedContent).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });
});
