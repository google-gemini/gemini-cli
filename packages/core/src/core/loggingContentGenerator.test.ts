/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { ContentGenerator } from './contentGenerator.js';
import { Config } from '../config/config.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as loggers from '../telemetry/loggers.js';

describe('LoggingContentGenerator', () => {
  let wrapped: ContentGenerator;
  let config: Config;
  let generator: LoggingContentGenerator;

  beforeEach(() => {
    wrapped = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    config = {
      getModel: () => 'test-model',
      getContentGeneratorConfig: () => ({
        authType: 'test-auth',
      }),
    } as unknown as Config;
    generator = new LoggingContentGenerator(wrapped, config);
    vi.spyOn(loggers, 'logApiRequest').mockImplementation(() => {});
    vi.spyOn(loggers, 'logApiResponse').mockImplementation(() => {});
    vi.spyOn(loggers, 'logApiError').mockImplementation(() => {});
  });

  describe('generateContent', () => {
    it('should log request and response on success', async () => {
      const req: GenerateContentParameters = {
        contents: [],
        model: 'test-model',
      };
      const res = {
        candidates: [],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      } as unknown as GenerateContentResponse;
      (wrapped.generateContent as Mock).mockResolvedValue(res);

      await generator.generateContent(req, 'prompt-123');

      expect(loggers.logApiRequest).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
        }),
      );
      expect(loggers.logApiResponse).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
          input_token_count: 10,
          output_token_count: 20,
        }),
      );
    });

    it('should log request and error on failure', async () => {
      const req: GenerateContentParameters = {
        contents: [],
        model: 'test-model',
      };
      const error = new Error('test error');
      (wrapped.generateContent as Mock).mockRejectedValue(error);

      await expect(
        generator.generateContent(req, 'prompt-123'),
      ).rejects.toThrow('test error');

      expect(loggers.logApiRequest).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
        }),
      );
      expect(loggers.logApiError).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
          error: 'test error',
        }),
      );
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response on success', async () => {
      const req: GenerateContentParameters = {
        contents: [],
        model: 'test-model',
      };
      const res = {
        candidates: [],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      } as unknown as GenerateContentResponse;
      (wrapped.generateContentStream as Mock).mockResolvedValue(
        (async function* () {
          yield res;
        })(),
      );

      const stream = await generator.generateContentStream(req, 'prompt-123');
      for await (const _ of stream) {
        // consume stream
      }

      expect(loggers.logApiRequest).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
        }),
      );
      expect(loggers.logApiResponse).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
          input_token_count: 10,
          output_token_count: 20,
        }),
      );
    });

    it('should log request and error on failure', async () => {
      const req: GenerateContentParameters = {
        contents: [],
        model: 'test-model',
      };
      const error = new Error('test error');
      (wrapped.generateContentStream as Mock).mockRejectedValue(error);

      await expect(
        generator.generateContentStream(req, 'prompt-123'),
      ).rejects.toThrow('test error');

      expect(loggers.logApiRequest).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
        }),
      );
      expect(loggers.logApiError).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'test-model',
          prompt_id: 'prompt-123',
          error: 'test error',
        }),
      );
    });
  });
});
