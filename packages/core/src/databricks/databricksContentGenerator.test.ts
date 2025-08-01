/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabricksContentGenerator } from './databricksContentGenerator.js';
import type { GenerateContentParameters } from '@google/genai';
import type { DatabricksConfig } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DatabricksContentGenerator', () => {
  let generator: DatabricksContentGenerator;
  let config: DatabricksConfig;

  // Helper function to create GenerateContentParameters
  function createRequest(options: {
    prompt: string;
    model: string;
    systemInstruction?: { text: string };
    generationConfig?: {
      temperature?: number;
      maxOutputTokens?: number;
      stopSequences?: string[];
    };
  }): GenerateContentParameters {
    const contents = [
      {
        role: 'user' as const,
        parts: [{ text: options.prompt }],
      },
    ];

    // System instruction is handled separately in the generator
    // We'll pass it as part of the config

    return {
      model: options.model,
      contents,
      config: options.generationConfig
        ? {
            temperature: options.generationConfig.temperature,
            maxOutputTokens: options.generationConfig.maxOutputTokens,
            stopSequences: options.generationConfig.stopSequences,
          }
        : undefined,
      systemInstruction: options.systemInstruction,
    } as GenerateContentParameters;
  }

  beforeEach(() => {
    vi.resetAllMocks();

    config = {
      workspace_host: 'https://dbc-test.cloud.databricks.com',
      auth_token: 'dapi-test-token',
      model: 'databricks-dbrx-instruct',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Configuration and Initialization', () => {
    it('should create instance with valid configuration', () => {
      generator = new DatabricksContentGenerator(config);
      expect(generator).toBeDefined();
      expect(generator).toBeInstanceOf(DatabricksContentGenerator);
    });

    it('should throw error when workspace_host is missing', () => {
      const invalidConfig = { ...config, workspace_host: '' };
      expect(() => new DatabricksContentGenerator(invalidConfig)).toThrow(
        'Databricks workspace host is required',
      );
    });

    it('should throw error when auth_token is missing', () => {
      const invalidConfig = { ...config, auth_token: '' };
      expect(() => new DatabricksContentGenerator(invalidConfig)).toThrow(
        'Databricks auth token is required',
      );
    });

    it('should throw error when model is missing', () => {
      const invalidConfig = { ...config, model: '' };
      expect(() => new DatabricksContentGenerator(invalidConfig)).toThrow(
        'Databricks model is required',
      );
    });

    it('should normalize workspace_host URL', () => {
      const configWithSlash = {
        ...config,
        workspace_host: 'https://dbc-test.cloud.databricks.com/',
      };
      generator = new DatabricksContentGenerator(configWithSlash);

      // Access the normalized URL through a method or property
      expect(generator.getWorkspaceHost()).toBe(
        'https://dbc-test.cloud.databricks.com',
      );
    });
  });

  describe('Model Mapping', () => {
    it('should map Claude model names to Databricks endpoints', () => {
      const modelMappings = {
        'claude-3-5-sonnet-latest': 'databricks-dbrx-instruct',
        'claude-3-5-haiku-latest': 'databricks-meta-llama-3-1-70b-instruct',
        'claude-3-opus-latest': 'databricks-meta-llama-3-1-405b-instruct',
      };

      Object.entries(modelMappings).forEach(
        ([claudeModel, databricksModel]) => {
          const config = {
            workspace_host: 'https://dbc-test.cloud.databricks.com',
            auth_token: 'dapi-test-token',
            model: claudeModel,
          };

          generator = new DatabricksContentGenerator(config);
          expect(generator.getDatabricksModel()).toBe(databricksModel);
        },
      );
    });

    it('should use provided model if no mapping exists', () => {
      const customModel = 'custom-databricks-model';
      const config = {
        workspace_host: 'https://dbc-test.cloud.databricks.com',
        auth_token: 'dapi-test-token',
        model: customModel,
      };

      generator = new DatabricksContentGenerator(config);
      expect(generator.getDatabricksModel()).toBe(customModel);
    });
  });

  describe('Available Models', () => {
    it('should return list of available Databricks models', () => {
      generator = new DatabricksContentGenerator(config);
      const models = generator.getAvailableModels();

      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('databricks-dbrx-instruct');
      expect(models).toContain('databricks-meta-llama-3-1-70b-instruct');
      expect(models).toContain('databricks-meta-llama-3-1-405b-instruct');
    });
  });

  describe('Request Transformation', () => {
    it('should transform simple text prompt to Databricks format', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'What is the capital of France?',
        model: 'databricks-dbrx-instruct',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'test-id',
          choices: [
            {
              message: { content: 'Paris is the capital of France.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        }),
      });

      await generator.generateContent(request, 'test-id');

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
            messages: [
              { role: 'user', content: 'What is the capital of France?' },
            ],
            max_tokens: 4096,
            temperature: 0.7,
            stream: false,
          }),
        },
      );
    });

    it('should transform request with system prompt', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Hello',
        model: 'databricks-dbrx-instruct',
        systemInstruction: { text: 'You are a helpful assistant.' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'test-id',
          choices: [
            {
              message: { content: 'Hello! How can I help you?' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        }),
      });

      await generator.generateContent(request, 'test-id');

      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: 'POST',
        headers: expect.any(Object),
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
          ],
          max_tokens: 4096,
          temperature: 0.7,
          stream: false,
        }),
      });
    });

    it('should transform request with temperature and max tokens', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Write a story',
        model: 'databricks-dbrx-instruct',
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 2000,
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'test-id',
          choices: [
            {
              message: { content: 'Once upon a time...' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
        }),
      });

      await generator.generateContent(request, 'test-id');

      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: 'POST',
        headers: expect.any(Object),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Write a story' }],
          max_tokens: 2000,
          temperature: 0.9,
          stream: false,
        }),
      });
    });

    it('should transform request with stop sequences', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Count to 5',
        model: 'databricks-dbrx-instruct',
        generationConfig: {
          stopSequences: ['3', 'three'],
        },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'test-id',
          choices: [
            {
              message: { content: '1, 2, ' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
        }),
      });

      await generator.generateContent(request, 'test-id');

      expect(mockFetch).toHaveBeenCalledWith(expect.any(String), {
        method: 'POST',
        headers: expect.any(Object),
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Count to 5' }],
          max_tokens: 4096,
          temperature: 0.7,
          stream: false,
          stop: ['3', 'three'],
        }),
      });
    });

    it('should include proper authentication headers', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Hello',
        model: 'databricks-dbrx-instruct',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'test-id',
          choices: [
            {
              message: { content: 'Hi!' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

      await generator.generateContent(request, 'test-id');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer dapi-test-token',
            'Content-Type': 'application/json',
          },
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Hello',
        model: 'databricks-dbrx-instruct',
      });

      // Mock fetch to return 401 error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      });

      await expect(
        generator.generateContent(request, 'test-id'),
      ).rejects.toThrow('Authentication failed');
    });

    it('should handle rate limit errors', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Hello',
        model: 'databricks-dbrx-instruct',
      });

      // Mock fetch to return 429 error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: vi.fn().mockResolvedValue({ error: 'Rate limit exceeded' }),
      });

      await expect(
        generator.generateContent(request, 'test-id'),
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle model not found errors', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Hello',
        model: 'non-existent-model',
      });

      // Mock fetch to return 404 error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: 'Model not found' }),
      });

      await expect(
        generator.generateContent(request, 'test-id'),
      ).rejects.toThrow('Model not found');
    });
  });

  describe('Response Transformation', () => {
    it('should transform Databricks response to GenerateContentResponse format', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'What is 2+2?',
        model: 'databricks-dbrx-instruct',
      });

      const databricksResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'databricks-dbrx-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '2 + 2 = 4',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 7,
          total_tokens: 12,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(databricksResponse),
      });

      const response = await generator.generateContent(request, 'test-id');

      expect(response).toMatchObject({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: '2 + 2 = 4',
                },
              ],
              role: 'model',
            },
            finishReason: 'STOP',
            index: 0,
            safetyRatings: [],
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 7,
          totalTokenCount: 12,
        },
      });
    });

    it('should map finish reasons correctly', async () => {
      generator = new DatabricksContentGenerator(config);

      const finishReasonMappings = [
        { databricks: 'stop', expected: 'STOP' },
        { databricks: 'length', expected: 'MAX_TOKENS' },
        { databricks: 'content_filter', expected: 'SAFETY' },
        { databricks: 'function_call', expected: 'STOP' },
      ];

      for (const mapping of finishReasonMappings) {
        const request = createRequest({
          prompt: 'Test',
          model: 'databricks-dbrx-instruct',
        });

        const databricksResponse = {
          id: 'test-id',
          choices: [
            {
              message: { content: 'Response' },
              finish_reason: mapping.databricks,
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(databricksResponse),
        });

        const response = await generator.generateContent(request, 'test-id');
        expect(response.candidates?.[0]?.finishReason).toBe(mapping.expected);
      }
    });

    it('should handle empty response content', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Test',
        model: 'databricks-dbrx-instruct',
      });

      const databricksResponse = {
        id: 'test-id',
        choices: [
          {
            message: { content: '' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(databricksResponse),
      });

      const response = await generator.generateContent(request, 'test-id');

      expect(response.candidates?.[0]?.content?.parts?.[0]?.text).toBe('');
    });

    it('should handle missing usage data', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = createRequest({
        prompt: 'Test',
        model: 'databricks-dbrx-instruct',
      });

      const databricksResponse = {
        id: 'test-id',
        choices: [
          {
            message: { content: 'Response' },
            finish_reason: 'stop',
          },
        ],
        // usage field is missing
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(databricksResponse),
      });

      const response = await generator.generateContent(request, 'test-id');

      expect(response.usageMetadata).toEqual({
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      });
    });
  });

  describe('Token Counting', () => {
    it('should estimate token count for text', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = {
        model: 'databricks-dbrx-instruct',
        contents: [
          {
            parts: [{ text: 'This is a test message for token counting.' }],
            role: 'user' as const,
          },
        ],
      };

      const result = await generator.countTokens(request);

      // Should provide a reasonable estimate
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThan(50); // Reasonable upper bound for this text
    });

    it('should handle empty content', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = {
        model: 'databricks-dbrx-instruct',
        contents: [
          {
            parts: [{ text: '' }],
            role: 'user' as const,
          },
        ],
      };

      const result = await generator.countTokens(request);

      expect(result.totalTokens).toBe(0);
    });
  });

  describe('Embedding', () => {
    it('should throw not implemented error for embedContent', async () => {
      generator = new DatabricksContentGenerator(config);

      const request = {
        model: 'databricks-dbrx-instruct',
        contents: [
          {
            parts: [{ text: 'Test text for embedding' }],
            role: 'user' as const,
          },
        ],
      };

      await expect(generator.embedContent(request)).rejects.toThrow(
        'Embedding is not supported by Databricks provider',
      );
    });
  });
});
