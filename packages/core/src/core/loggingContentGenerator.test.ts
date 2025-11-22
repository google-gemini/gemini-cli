/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  EmbedContentParameters,
} from '@google/genai';

// Mock modules
vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));

vi.mock('../code_assist/converter.js', () => ({
  toContents: vi.fn((contents) => contents),
}));

vi.mock('../utils/quotaErrorDetection.js', () => ({
  isStructuredError: vi.fn(
    (error: unknown) => (error as { status?: number })?.status !== undefined,
  ),
}));

describe('LoggingContentGenerator', () => {
  let mockWrappedGenerator: ContentGenerator;
  let mockConfig: Config;
  let logger: LoggingContentGenerator;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWrappedGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    } as unknown;

    mockConfig = {
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'test-auth',
      }),
    } as unknown;

    logger = new LoggingContentGenerator(mockWrappedGenerator, mockConfig);
  });

  describe('getWrapped', () => {
    it('should return the wrapped content generator', () => {
      const wrapped = logger.getWrapped();
      expect(wrapped).toBe(mockWrappedGenerator);
    });
  });

  describe('generateContent', () => {
    it('should log request and response for successful generation', async () => {
      const { logApiRequest, logApiResponse } = await import(
        '../telemetry/loggers.js'
      );

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const mockResponse: GenerateContentResponse = {
        modelVersion: 'gemini-2.0-flash-001',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
        candidates: [],
      };

      vi.mocked(mockWrappedGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const result = await logger.generateContent(
        mockRequest,
        'test-prompt-id',
      );

      expect(result).toBe(mockResponse);
      expect(vi.mocked(logApiRequest)).toHaveBeenCalled();
      expect(vi.mocked(logApiResponse)).toHaveBeenCalled();
    });

    it('should log errors when generation fails', async () => {
      const { logApiRequest, logApiError } = await import(
        '../telemetry/loggers.js'
      );

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const testError = new Error('API Error');
      vi.mocked(mockWrappedGenerator.generateContent).mockRejectedValue(
        testError,
      );

      await expect(
        logger.generateContent(mockRequest, 'test-prompt-id'),
      ).rejects.toThrow('API Error');

      expect(vi.mocked(logApiRequest)).toHaveBeenCalled();
      expect(vi.mocked(logApiError)).toHaveBeenCalled();
    });

    it('should log structured errors with status code', async () => {
      const { logApiError } = await import('../telemetry/loggers.js');

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const structuredError = {
        status: 429,
        message: 'Rate limit exceeded',
        name: 'RateLimitError',
      };

      vi.mocked(mockWrappedGenerator.generateContent).mockRejectedValue(
        structuredError,
      );

      await expect(
        logger.generateContent(mockRequest, 'test-prompt-id'),
      ).rejects.toEqual(structuredError);

      expect(vi.mocked(logApiError)).toHaveBeenCalled();
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response for successful streaming', async () => {
      const { logApiRequest, logApiResponse } = await import(
        '../telemetry/loggers.js'
      );

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const mockResponses: GenerateContentResponse[] = [
        {
          modelVersion: 'gemini-2.0-flash-001',
          candidates: [],
        },
        {
          modelVersion: 'gemini-2.0-flash-001',
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
          candidates: [],
        },
      ];

      async function* mockStream() {
        for (const response of mockResponses) {
          yield response;
        }
      }

      vi.mocked(mockWrappedGenerator.generateContentStream).mockResolvedValue(
        mockStream(),
      );

      const stream = await logger.generateContentStream(
        mockRequest,
        'test-prompt-id',
      );

      const results: GenerateContentResponse[] = [];
      for await (const response of stream) {
        results.push(response);
      }

      expect(results).toHaveLength(2);
      expect(vi.mocked(logApiRequest)).toHaveBeenCalled();
      expect(vi.mocked(logApiResponse)).toHaveBeenCalled();
    });

    it('should log errors when stream creation fails', async () => {
      const { logApiRequest, logApiError } = await import(
        '../telemetry/loggers.js'
      );

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const testError = new Error('Stream creation failed');
      vi.mocked(mockWrappedGenerator.generateContentStream).mockRejectedValue(
        testError,
      );

      await expect(
        logger.generateContentStream(mockRequest, 'test-prompt-id'),
      ).rejects.toThrow('Stream creation failed');

      expect(vi.mocked(logApiRequest)).toHaveBeenCalled();
      expect(vi.mocked(logApiError)).toHaveBeenCalled();
    });

    it('should log errors when stream fails during iteration', async () => {
      const { logApiError } = await import('../telemetry/loggers.js');

      const mockRequest: GenerateContentParameters = {
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      async function* failingStream() {
        yield { modelVersion: 'gemini-2.0-flash-001', candidates: [] };
        throw new Error('Stream error');
      }

      vi.mocked(mockWrappedGenerator.generateContentStream).mockResolvedValue(
        failingStream(),
      );

      const stream = await logger.generateContentStream(
        mockRequest,
        'test-prompt-id',
      );

      await expect(async () => {
        for await (const _ of stream) {
          // Consume stream
        }
      }).rejects.toThrow('Stream error');

      expect(vi.mocked(logApiError)).toHaveBeenCalled();
    });
  });

  describe('countTokens', () => {
    it('should pass through to wrapped generator', async () => {
      const mockRequest: CountTokensParameters = {
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      };

      const mockResponse = { totalTokens: 5 };
      vi.mocked(mockWrappedGenerator.countTokens).mockResolvedValue(
        mockResponse,
      );

      const result = await logger.countTokens(mockRequest);

      expect(result).toBe(mockResponse);
      expect(mockWrappedGenerator.countTokens).toHaveBeenCalledWith(
        mockRequest,
      );
    });
  });

  describe('embedContent', () => {
    it('should pass through to wrapped generator', async () => {
      const mockRequest: EmbedContentParameters = {
        content: { parts: [{ text: 'Hello' }] },
      };

      const mockResponse = { embedding: { values: [0.1, 0.2, 0.3] } };
      vi.mocked(mockWrappedGenerator.embedContent).mockResolvedValue(
        mockResponse,
      );

      const result = await logger.embedContent(mockRequest);

      expect(result).toBe(mockResponse);
      expect(mockWrappedGenerator.embedContent).toHaveBeenCalledWith(
        mockRequest,
      );
    });
  });
});
