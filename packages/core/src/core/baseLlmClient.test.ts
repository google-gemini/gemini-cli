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
  type Mocked,
  type Mock,
} from 'vitest';

import { BaseLlmClient, type GenerateJsonOptions } from './baseLlmClient.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import type { GenerateContentOptions } from './baseLlmClient.js';
import type { GenerateContentResponse } from '@google/genai';
import type { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';
import { reportError } from '../utils/errorReporting.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { retryWithBackoff } from '../utils/retry.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { getErrorMessage } from '../utils/errors.js';
import type { ModelConfigService } from '../services/modelConfigService.js';
import { makeResolvedModelConfig } from '../services/modelConfigServiceTestUtils.js';

vi.mock('../utils/errorReporting.js');
vi.mock('../telemetry/loggers.js');
vi.mock('../utils/errors.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/errors.js')>();
  return {
    ...actual,
    getErrorMessage: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
  };
});

vi.mock('../utils/retry.js', () => ({
  retryWithBackoff: vi.fn(async (fn, options) => {
    // Default implementation - just call the function
    const result = await fn();

    // If shouldRetryOnContent is provided, test it but don't actually retry
    // (unless we want to simulate retry exhaustion for testing)
    if (options?.shouldRetryOnContent) {
      const shouldRetry = options.shouldRetryOnContent(result);
      if (shouldRetry) {
        // Check if we need to simulate retry exhaustion (for error testing)
        const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (
          !responseText ||
          responseText.trim() === '' ||
          responseText.includes('{"color": "blue"')
        ) {
          throw new Error('Retry attempts exhausted for invalid content');
        }
      }
    }

    const context = options?.getAvailabilityContext?.();
    if (context) {
      context.service.markHealthy(context.policy.model);
    }

    return result;
  }),
}));

const mockGenerateContent = vi.fn();
const mockEmbedContent = vi.fn();

const mockContentGenerator = {
  generateContent: mockGenerateContent,
  embedContent: mockEmbedContent,
} as unknown as Mocked<ContentGenerator>;

// Helper to create a mock GenerateContentResponse
const createMockResponse = (text: string): GenerateContentResponse =>
  ({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }],
  }) as GenerateContentResponse;

describe('BaseLlmClient', () => {
  let client: BaseLlmClient;
  let abortController: AbortController;
  let defaultOptions: GenerateJsonOptions;
  let mockConfig: Mocked<Config>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mocked implementation for getErrorMessage for accurate error message assertions
    vi.mocked(getErrorMessage).mockImplementation((e) =>
      e instanceof Error ? e.message : String(e),
    );

    mockConfig = {
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: AuthType.USE_GEMINI }),
      getEmbeddingModel: vi.fn().mockReturnValue('test-embedding-model'),
      isInteractive: vi.fn().mockReturnValue(false),
      modelConfigService: {
        getResolvedConfig: vi
          .fn()
          .mockImplementation(({ model }) => makeResolvedModelConfig(model)),
      } as unknown as ModelConfigService,
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(createAvailabilityServiceMock()),
      setActiveModel: vi.fn(),
      getPreviewFeatures: vi.fn().mockReturnValue(false),
      getUserTier: vi.fn().mockReturnValue(undefined),
      getModel: vi.fn().mockReturnValue('test-model'),
      getActiveModel: vi.fn().mockReturnValue('test-model'),
    } as unknown as Mocked<Config>;

    client = new BaseLlmClient(mockContentGenerator, mockConfig);
    abortController = new AbortController();
    defaultOptions = {
      modelConfigKey: { model: 'test-model' },
      contents: [{ role: 'user', parts: [{ text: 'Give me a color.' }] }],
      schema: { type: 'object', properties: { color: { type: 'string' } } },
      abortSignal: abortController.signal,
      promptId: 'test-prompt-id',
    };
  });

  afterEach(() => {
    abortController.abort();
  });

  describe('generateJson - Success Scenarios', () => {
    it('should call generateContent with correct parameters, defaults, and utilize retry mechanism', async () => {
      const mockResponse = createMockResponse('{"color": "blue"}');
      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'blue' });

      // Ensure the retry mechanism was engaged with shouldRetryOnContent
      expect(retryWithBackoff).toHaveBeenCalledTimes(1);
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          shouldRetryOnContent: expect.any(Function),
        }),
      );

      // Validate the parameters passed to the underlying generator
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        {
          model: 'test-model',
          contents: defaultOptions.contents,
          config: {
            abortSignal: defaultOptions.abortSignal,
            responseJsonSchema: defaultOptions.schema,
            responseMimeType: 'application/json',
            temperature: 0,
            topP: 1,
            // Crucial: systemInstruction should NOT be in the config object if not provided
          },
        },
        'test-prompt-id',
      );
    });

    it('should include system instructions when provided', async () => {
      const mockResponse = createMockResponse('{"color": "green"}');
      mockGenerateContent.mockResolvedValue(mockResponse);
      const systemInstruction = 'You are a helpful assistant.';

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        systemInstruction,
      };

      await client.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            systemInstruction,
          }),
        }),
        expect.any(String),
      );
    });

    it('should use the provided promptId', async () => {
      const mockResponse = createMockResponse('{"color": "yellow"}');
      mockGenerateContent.mockResolvedValue(mockResponse);
      const customPromptId = 'custom-id-123';

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        promptId: customPromptId,
      };

      await client.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.any(Object),
        customPromptId,
      );
    });

    it('should pass maxAttempts to retryWithBackoff when provided', async () => {
      const mockResponse = createMockResponse('{"color": "cyan"}');
      mockGenerateContent.mockResolvedValue(mockResponse);
      const customMaxAttempts = 3;

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        maxAttempts: customMaxAttempts,
      };

      await client.generateJson(options);

      expect(retryWithBackoff).toHaveBeenCalledTimes(1);
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: customMaxAttempts,
        }),
      );
    });

    it('should call retryWithBackoff without maxAttempts when not provided', async () => {
      const mockResponse = createMockResponse('{"color": "indigo"}');
      mockGenerateContent.mockResolvedValue(mockResponse);

      // No maxAttempts in defaultOptions
      await client.generateJson(defaultOptions);

      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: 5,
        }),
      );
    });
  });

  describe('generateJson - Content Validation and Retries', () => {
    it('should validate content using shouldRetryOnContent function', async () => {
      const mockResponse = createMockResponse('{"color": "blue"}');
      mockGenerateContent.mockResolvedValue(mockResponse);

      await client.generateJson(defaultOptions);

      // Verify that retryWithBackoff was called with shouldRetryOnContent
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          shouldRetryOnContent: expect.any(Function),
        }),
      );

      // Test the shouldRetryOnContent function behavior
      const retryCall = vi.mocked(retryWithBackoff).mock.calls[0];
      const shouldRetryOnContent = retryCall[1]?.shouldRetryOnContent;

      // Valid JSON should not trigger retry
      expect(shouldRetryOnContent!(mockResponse)).toBe(false);

      // Empty response should trigger retry
      expect(shouldRetryOnContent!(createMockResponse(''))).toBe(true);

      // Invalid JSON should trigger retry
      expect(
        shouldRetryOnContent!(createMockResponse('{"color": "blue"')),
      ).toBe(true);
    });
  });

  describe('generateJson - Response Cleaning', () => {
    it('should clean JSON wrapped in markdown backticks and log telemetry', async () => {
      const malformedResponse = '```json\n{"color": "purple"}\n```';
      mockGenerateContent.mockResolvedValue(
        createMockResponse(malformedResponse),
      );

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'purple' });
      expect(logMalformedJsonResponse).toHaveBeenCalledWith(
        mockConfig,
        expect.any(MalformedJsonResponseEvent),
      );
      // Validate the telemetry event content - find the most recent call
      const calls = vi.mocked(logMalformedJsonResponse).mock.calls;
      const lastCall = calls[calls.length - 1];
      const event = lastCall[1];
      expect(event.model).toBe(defaultOptions.modelConfigKey.model);
    });

    it('should handle extra whitespace correctly without logging malformed telemetry', async () => {
      const responseWithWhitespace = '  \n  {"color": "orange"}  \n';
      mockGenerateContent.mockResolvedValue(
        createMockResponse(responseWithWhitespace),
      );

      const result = await client.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'orange' });
      expect(logMalformedJsonResponse).not.toHaveBeenCalled();
    });

    it('should use the resolved model name when logging malformed JSON telemetry', async () => {
      const aliasModel = 'fast-alias';
      const resolvedModel = 'gemini-1.5-flash';

      // Override the mock for this specific test to simulate resolution
      (
        mockConfig.modelConfigService.getResolvedConfig as unknown as Mock
      ).mockReturnValue({
        model: resolvedModel,
        generateContentConfig: {
          temperature: 0,
          topP: 1,
        },
      });

      const malformedResponse = '```json\n{"color": "red"}\n```';
      mockGenerateContent.mockResolvedValue(
        createMockResponse(malformedResponse),
      );

      const options = {
        ...defaultOptions,
        modelConfigKey: { model: aliasModel },
      };

      const result = await client.generateJson(options);

      expect(result).toEqual({ color: 'red' });

      expect(logMalformedJsonResponse).toHaveBeenCalled();
      const calls = vi.mocked(logMalformedJsonResponse).mock.calls;
      const lastCall = calls[calls.length - 1];
      const event = lastCall[1];

      // This is the key assertion: it should be the resolved model, not the alias
      expect(event.model).toBe(resolvedModel);
      expect(event.model).not.toBe(aliasModel);
    });
  });

  describe('generateJson - Error Handling', () => {
    it('should throw and report error for empty response after retry exhaustion', async () => {
      mockGenerateContent.mockResolvedValue(createMockResponse(''));

      await expect(client.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate content: Retry attempts exhausted for invalid content',
      );

      // Verify error reporting details
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        'API returned invalid content after all retries.',
        defaultOptions.contents,
        'generateJson-invalid-content',
      );
    });

    it('should throw and report error for invalid JSON syntax after retry exhaustion', async () => {
      const invalidJson = '{"color": "blue"'; // missing closing brace
      mockGenerateContent.mockResolvedValue(createMockResponse(invalidJson));

      await expect(client.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate content: Retry attempts exhausted for invalid content',
      );

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        'API returned invalid content after all retries.',
        defaultOptions.contents,
        'generateJson-invalid-content',
      );
    });

    it('should throw and report generic API errors', async () => {
      const apiError = new Error('Service Unavailable (503)');
      // Simulate the generator failing
      mockGenerateContent.mockRejectedValue(apiError);

      await expect(client.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate content: Service Unavailable (503)',
      );

      // Verify generic error reporting
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        apiError,
        'Error generating content via API.',
        defaultOptions.contents,
        'generateJson-api',
      );
    });

    it('should throw immediately without reporting if aborted', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');

      // Simulate abortion happening during the API call
      mockGenerateContent.mockImplementation(() => {
        abortController.abort(); // Ensure the signal is aborted when the service checks
        throw abortError;
      });

      const options = {
        ...defaultOptions,
        abortSignal: abortController.signal,
      };

      await expect(client.generateJson(options)).rejects.toThrow(abortError);

      // Crucially, it should not report a cancellation as an application error
      expect(reportError).not.toHaveBeenCalled();
    });
  });

  describe('generateEmbedding', () => {
    const texts = ['hello world', 'goodbye world'];
    const testEmbeddingModel = 'test-embedding-model';

    it('should call embedContent with correct parameters and return embeddings', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      mockEmbedContent.mockResolvedValue({
        embeddings: [
          { values: mockEmbeddings[0] },
          { values: mockEmbeddings[1] },
        ],
      });

      const result = await client.generateEmbedding(texts);

      expect(mockEmbedContent).toHaveBeenCalledTimes(1);
      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: testEmbeddingModel,
        contents: texts,
      });
      expect(result).toEqual(mockEmbeddings);
    });

    it('should return an empty array if an empty array is passed', async () => {
      const result = await client.generateEmbedding([]);
      expect(result).toEqual([]);
      expect(mockEmbedContent).not.toHaveBeenCalled();
    });

    it('should throw an error if API response has no embeddings array', async () => {
      mockEmbedContent.mockResolvedValue({});

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API response has an empty embeddings array', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [],
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'No embeddings found in API response.',
      );
    });

    it('should throw an error if API returns a mismatched number of embeddings', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [1, 2, 3] }], // Only one for two texts
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned a mismatched number of embeddings. Expected 2, got 1.',
      );
    });

    it('should throw an error if any embedding has nullish values', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [1, 2, 3] }, { values: undefined }], // Second one is bad
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 1: "goodbye world"',
      );
    });

    it('should throw an error if any embedding has an empty values array', async () => {
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: [] }, { values: [1, 2, 3] }], // First one is bad
      });

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API returned an empty embedding for input text at index 0: "hello world"',
      );
    });

    it('should propagate errors from the API call', async () => {
      mockEmbedContent.mockRejectedValue(new Error('API Failure'));

      await expect(client.generateEmbedding(texts)).rejects.toThrow(
        'API Failure',
      );
    });
  });

  describe('generateContent', () => {
    it('should call generateContent with correct parameters and utilize retry mechanism', async () => {
      const mockResponse = createMockResponse('This is the content.');
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        modelConfigKey: { model: 'test-model' },
        contents: [{ role: 'user', parts: [{ text: 'Give me content.' }] }],
        abortSignal: abortController.signal,
        promptId: 'content-prompt-id',
      };

      const result = await client.generateContent(options);

      expect(result).toBe(mockResponse);

      // Ensure the retry mechanism was engaged
      expect(retryWithBackoff).toHaveBeenCalledTimes(1);
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          shouldRetryOnContent: expect.any(Function),
        }),
      );

      // Validate the parameters passed to the underlying generator
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        {
          model: 'test-model',
          contents: options.contents,
          config: {
            abortSignal: options.abortSignal,
            temperature: 0,
            topP: 1,
          },
        },
        'content-prompt-id',
      );
    });

    it('should validate content using shouldRetryOnContent function', async () => {
      const mockResponse = createMockResponse('Some valid content.');
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options = {
        modelConfigKey: { model: 'test-model' },
        contents: [{ role: 'user', parts: [{ text: 'Give me content.' }] }],
        abortSignal: abortController.signal,
        promptId: 'content-prompt-id',
      };

      await client.generateContent(options);

      const retryCall = vi.mocked(retryWithBackoff).mock.calls[0];
      const shouldRetryOnContent = retryCall[1]?.shouldRetryOnContent;

      // Valid content should not trigger retry
      expect(shouldRetryOnContent!(mockResponse)).toBe(false);

      // Empty response should trigger retry
      expect(shouldRetryOnContent!(createMockResponse(''))).toBe(true);
      expect(shouldRetryOnContent!(createMockResponse('   '))).toBe(true);
    });

    it('should throw and report error for empty response after retry exhaustion', async () => {
      mockGenerateContent.mockResolvedValue(createMockResponse(''));
      const options = {
        modelConfigKey: { model: 'test-model' },
        contents: [{ role: 'user', parts: [{ text: 'Give me content.' }] }],
        abortSignal: abortController.signal,
        promptId: 'content-prompt-id',
      };

      await expect(client.generateContent(options)).rejects.toThrow(
        'Failed to generate content: Retry attempts exhausted for invalid content',
      );

      // Verify error reporting details
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        'API returned invalid content after all retries.',
        options.contents,
        'generateContent-invalid-content',
      );
    });
  });

  describe('Availability Service Integration', () => {
    let mockAvailabilityService: ModelAvailabilityService;
    let contentOptions: GenerateContentOptions;
    let jsonOptions: GenerateJsonOptions;

    beforeEach(() => {
      mockAvailabilityService = createAvailabilityServiceMock({
        selectedModel: 'test-model',
        skipped: [],
      });

      // Reflect setActiveModel into getActiveModel so availability-driven updates
      // are visible to the client under test.
      mockConfig.getActiveModel = vi.fn().mockReturnValue('test-model');
      mockConfig.setActiveModel = vi.fn((model: string) => {
        vi.mocked(mockConfig.getActiveModel).mockReturnValue(model);
      });

      vi.spyOn(mockConfig, 'getModelAvailabilityService').mockReturnValue(
        mockAvailabilityService,
      );

      contentOptions = {
        modelConfigKey: { model: 'test-model' },
        contents: [{ role: 'user', parts: [{ text: 'Give me a color.' }] }],
        abortSignal: abortController.signal,
        promptId: 'content-prompt-id',
      };

      jsonOptions = {
        ...defaultOptions,
        promptId: 'json-prompt-id',
      };
    });

    it('should mark model as healthy on success', async () => {
      const successfulModel = 'gemini-pro';
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: successfulModel,
        skipped: [],
      });
      mockGenerateContent.mockResolvedValue(
        createMockResponse('Some text response'),
      );

      await client.generateContent({
        ...contentOptions,
        modelConfigKey: { model: successfulModel },
      });

      expect(mockAvailabilityService.markHealthy).toHaveBeenCalledWith(
        successfulModel,
      );
    });

    it('marks the final attempted model healthy after a retry with availability enabled', async () => {
      const firstModel = 'gemini-pro';
      const fallbackModel = 'gemini-flash';
      vi.mocked(mockAvailabilityService.selectFirstAvailable)
        .mockReturnValueOnce({ selectedModel: firstModel, skipped: [] })
        .mockReturnValueOnce({ selectedModel: fallbackModel, skipped: [] });

      mockGenerateContent
        .mockResolvedValueOnce(createMockResponse('retry-me'))
        .mockResolvedValueOnce(createMockResponse('final-response'));

      // Run the real retryWithBackoff (with fake timers) to exercise the retry path
      vi.useFakeTimers();

      const retryPromise = client.generateContent({
        ...contentOptions,
        modelConfigKey: { model: firstModel },
        maxAttempts: 2,
      });

      await vi.runAllTimersAsync();
      await retryPromise;

      await client.generateContent({
        ...contentOptions,
        modelConfigKey: { model: firstModel },
        maxAttempts: 2,
      });

      expect(mockConfig.setActiveModel).toHaveBeenCalledWith(firstModel);
      expect(mockConfig.setActiveModel).toHaveBeenCalledWith(fallbackModel);
      expect(mockAvailabilityService.markHealthy).toHaveBeenCalledWith(
        fallbackModel,
      );
      expect(mockGenerateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: fallbackModel }),
        expect.any(String),
      );
    });

    it('should consume sticky attempt if selection has attempts', async () => {
      const stickyModel = 'gemini-pro-sticky';
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: stickyModel,
        attempts: 1,
        skipped: [],
      });
      mockGenerateContent.mockResolvedValue(
        createMockResponse('Some text response'),
      );
      vi.mocked(retryWithBackoff).mockImplementation(async (fn, options) => {
        const result = await fn();
        const context = options?.getAvailabilityContext?.();
        if (context) {
          context.service.markHealthy(context.policy.model);
        }
        return result;
      });

      await client.generateContent({
        ...contentOptions,
        modelConfigKey: { model: stickyModel },
      });

      expect(mockAvailabilityService.consumeStickyAttempt).toHaveBeenCalledWith(
        stickyModel,
      );
      expect(retryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ maxAttempts: 1 }),
      );
    });

    it('should mark healthy and honor availability selection when using generateJson', async () => {
      const availableModel = 'gemini-json-pro';
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: availableModel,
        skipped: [],
      });
      mockGenerateContent.mockResolvedValue(
        createMockResponse('{"color":"violet"}'),
      );
      vi.mocked(retryWithBackoff).mockImplementation(async (fn, options) => {
        const result = await fn();
        const context = options?.getAvailabilityContext?.();
        if (context) {
          context.service.markHealthy(context.policy.model);
        }
        return result;
      });

      const result = await client.generateJson(jsonOptions);

      expect(result).toEqual({ color: 'violet' });
      expect(mockConfig.setActiveModel).toHaveBeenCalledWith(availableModel);
      expect(mockAvailabilityService.markHealthy).toHaveBeenCalledWith(
        availableModel,
      );
      expect(mockGenerateContent).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: availableModel }),
        jsonOptions.promptId,
      );
    });

    it('should refresh configuration when model changes mid-retry', async () => {
      const firstModel = 'gemini-pro';
      const fallbackModel = 'gemini-flash';

      // Provide distinct configs per model
      const getResolvedConfigMock = vi.mocked(
        mockConfig.modelConfigService.getResolvedConfig,
      );
      getResolvedConfigMock.mockImplementation((key) => {
        if (key.model === firstModel) {
          return makeResolvedModelConfig(firstModel, { temperature: 0.1 });
        }
        if (key.model === fallbackModel) {
          return makeResolvedModelConfig(fallbackModel, { temperature: 0.9 });
        }
        return makeResolvedModelConfig(key.model);
      });

      // Availability selects the first model initially
      vi.mocked(mockAvailabilityService.selectFirstAvailable).mockReturnValue({
        selectedModel: firstModel,
        skipped: [],
      });

      // Change active model after the first attempt
      let activeModel = firstModel;
      mockConfig.setActiveModel = vi.fn(); // Prevent setActiveModel from resetting getActiveModel mock
      mockConfig.getActiveModel.mockImplementation(() => activeModel);

      // First response empty -> triggers retry; second response valid
      mockGenerateContent
        .mockResolvedValueOnce(createMockResponse(''))
        .mockResolvedValueOnce(createMockResponse('final-response'));

      // Custom retry to force two attempts
      vi.mocked(retryWithBackoff).mockImplementation(async (fn, options) => {
        const first = (await fn()) as GenerateContentResponse;
        if (options?.shouldRetryOnContent?.(first)) {
          activeModel = fallbackModel; // simulate handler switching active model before retry
          return (await fn()) as GenerateContentResponse;
        }
        return first;
      });

      await client.generateContent({
        ...contentOptions,
        modelConfigKey: { model: firstModel },
        maxAttempts: 2,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
      const secondCall = mockGenerateContent.mock.calls[1]?.[0];

      expect(
        mockConfig.modelConfigService.getResolvedConfig,
      ).toHaveBeenCalledWith({ model: fallbackModel });
      expect(secondCall?.model).toBe(fallbackModel);
      expect(secondCall?.config?.temperature).toBe(0.9);
    });
  });
});
