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
} from 'vitest';

import type { GenerateContentResponse } from '@google/genai';
import {
  LlmUtilityService,
  type GenerateJsonOptions,
} from './llmUtilityService.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';
import { reportError } from '../utils/errorReporting.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { retryWithBackoff } from '../utils/retry.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { getErrorMessage } from '../utils/errors.js';

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
  retryWithBackoff: vi.fn(async (fn) => await fn()),
}));

const mockGenerateContent = vi.fn();

const mockContentGenerator = {
  generateContent: mockGenerateContent,
} as unknown as Mocked<ContentGenerator>;

const mockConfig = {
  getSessionId: vi.fn().mockReturnValue('test-session-id'),
  getContentGeneratorConfig: vi
    .fn()
    .mockReturnValue({ authType: AuthType.USE_GEMINI }),
} as unknown as Mocked<Config>;

// Helper to create a mock GenerateContentResponse
const createMockResponse = (text: string): GenerateContentResponse =>
  ({
    candidates: [{ content: { role: 'model', parts: [{ text }] }, index: 0 }],
  }) as GenerateContentResponse;

describe('LlmUtilityService', () => {
  let service: LlmUtilityService;
  let abortController: AbortController;
  let defaultOptions: GenerateJsonOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mocked implementation for getErrorMessage for accurate error message assertions
    vi.mocked(getErrorMessage).mockImplementation((e) =>
      e instanceof Error ? e.message : String(e),
    );
    service = new LlmUtilityService(mockContentGenerator, mockConfig);
    abortController = new AbortController();
    defaultOptions = {
      contents: [{ role: 'user', parts: [{ text: 'Give me a color.' }] }],
      schema: { type: 'object', properties: { color: { type: 'string' } } },
      model: 'test-model',
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

      const result = await service.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'blue' });

      // Ensure the retry mechanism was engaged
      expect(retryWithBackoff).toHaveBeenCalledTimes(1);

      // Validate the parameters passed to the underlying generator
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        {
          model: 'test-model',
          contents: defaultOptions.contents,
          config: {
            abortSignal: defaultOptions.abortSignal,
            temperature: 0,
            topP: 1,
            responseJsonSchema: defaultOptions.schema,
            responseMimeType: 'application/json',
            // Crucial: systemInstruction should NOT be in the config object if not provided
          },
        },
        'test-prompt-id',
      );
    });

    it('should respect configuration overrides', async () => {
      const mockResponse = createMockResponse('{"color": "red"}');
      mockGenerateContent.mockResolvedValue(mockResponse);

      const options: GenerateJsonOptions = {
        ...defaultOptions,
        config: { temperature: 0.8, topK: 10 },
      };

      await service.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            temperature: 0.8,
            topP: 1, // Default should remain if not overridden
            topK: 10,
          }),
        }),
        expect.any(String),
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

      await service.generateJson(options);

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

      await service.generateJson(options);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.any(Object),
        customPromptId,
      );
    });
  });

  describe('generateJson - Response Cleaning', () => {
    it('should clean JSON wrapped in markdown backticks and log telemetry', async () => {
      const malformedResponse = '```json\n{"color": "purple"}\n```';
      mockGenerateContent.mockResolvedValue(
        createMockResponse(malformedResponse),
      );

      const result = await service.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'purple' });
      expect(logMalformedJsonResponse).toHaveBeenCalledTimes(1);
      expect(logMalformedJsonResponse).toHaveBeenCalledWith(
        mockConfig,
        expect.any(MalformedJsonResponseEvent),
      );
      // Validate the telemetry event content
      const event = vi.mocked(logMalformedJsonResponse).mock
        .calls[0][1] as MalformedJsonResponseEvent;
      expect(event.model).toBe('test-model');
    });

    it('should handle extra whitespace correctly without logging malformed telemetry', async () => {
      const responseWithWhitespace = '  \n  {"color": "orange"}  \n';
      mockGenerateContent.mockResolvedValue(
        createMockResponse(responseWithWhitespace),
      );

      const result = await service.generateJson(defaultOptions);

      expect(result).toEqual({ color: 'orange' });
      expect(logMalformedJsonResponse).not.toHaveBeenCalled();
    });
  });

  describe('generateJson - Error Handling', () => {
    it('should throw and report error for empty response', async () => {
      mockGenerateContent.mockResolvedValue(createMockResponse(''));

      // The final error message includes the prefix added by the service's outer catch block.
      await expect(service.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate JSON content: API returned an empty response for generateJson.',
      );

      // Verify error reporting details
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        'Error in generateJson: API returned an empty response.',
        defaultOptions.contents,
        'generateJson-empty-response',
      );
    });

    it('should throw and report error for invalid JSON syntax', async () => {
      const invalidJson = '{"color": "blue"'; // missing closing brace
      mockGenerateContent.mockResolvedValue(createMockResponse(invalidJson));

      await expect(service.generateJson(defaultOptions)).rejects.toThrow(
        /^Failed to generate JSON content: Failed to parse API response as JSON:/,
      );

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        'Failed to parse JSON response from generateJson.',
        expect.objectContaining({ responseTextFailedToParse: invalidJson }),
        'generateJson-parse',
      );
    });

    it('should throw and report generic API errors', async () => {
      const apiError = new Error('Service Unavailable (503)');
      // Simulate the generator failing
      mockGenerateContent.mockRejectedValue(apiError);

      await expect(service.generateJson(defaultOptions)).rejects.toThrow(
        'Failed to generate JSON content: Service Unavailable (503)',
      );

      // Verify generic error reporting
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(
        apiError,
        'Error generating JSON content via API.',
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

      await expect(service.generateJson(options)).rejects.toThrow(abortError);

      // Crucially, it should not report a cancellation as an application error
      expect(reportError).not.toHaveBeenCalled();
    });
  });
});
