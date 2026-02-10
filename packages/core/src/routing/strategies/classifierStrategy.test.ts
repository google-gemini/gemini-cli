/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ClassifierStrategy } from './classifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';

vi.mock('../../core/baseLlmClient.js');

describe('ClassifierStrategy', () => {
  let strategy: ClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockResolvedConfig: ResolvedModelConfig;
  let mockGetModel: Mock;
  let mockGetNumericalRoutingEnabled: Mock;
  let mockGenerateJson: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new ClassifierStrategy();
    mockContext = {
      history: [],
      request: [{ text: 'simple task' }],
      signal: new AbortController().signal,
    };

    mockResolvedConfig = {
      model: 'classifier',
      generateContentConfig: {},
    } as unknown as ResolvedModelConfig;

    mockGetModel = vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    mockGetNumericalRoutingEnabled = vi.fn().mockResolvedValue(false);
    mockGenerateJson = vi.fn();

    mockConfig = {
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue(mockResolvedConfig),
      },
      getModel: mockGetModel,
      getPreviewFeatures: () => false,
      getNumericalRoutingEnabled: mockGetNumericalRoutingEnabled,
    } as unknown as Config;

    mockBaseLlmClient = {
      generateJson: mockGenerateJson,
    } as unknown as BaseLlmClient;

    vi.spyOn(promptIdContext, 'getStore').mockReturnValue('test-prompt-id');
  });

  it('should return null if numerical routing is enabled and model is Gemini 3', async () => {
    mockGetNumericalRoutingEnabled.mockResolvedValue(true);
    mockGetModel.mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(mockGenerateJson).not.toHaveBeenCalled();
  });

  it('should NOT return null if numerical routing is enabled but model is NOT Gemini 3', async () => {
    mockGetNumericalRoutingEnabled.mockResolvedValue(true);
    mockGetModel.mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    mockGenerateJson.mockResolvedValue({
      reasoning: 'test',
      model_choice: 'flash',
    });

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).not.toBeNull();
    expect(mockGenerateJson).toHaveBeenCalled();
  });

  it('should call generateJson with the correct parameters', async () => {
    const mockApiResponse = {
      reasoning: 'Simple task',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    expect(mockGenerateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfigKey: { model: mockResolvedConfig.model },
        promptId: 'test-prompt-id',
      }),
    );
  });

  it('should route to FLASH model for a simple task', async () => {
    const mockApiResponse = {
      reasoning: 'This is a simple task.',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockGenerateJson).toHaveBeenCalledOnce();
    expect(decision).toEqual({
      model: DEFAULT_GEMINI_FLASH_MODEL,
      metadata: {
        source: 'Classifier',
        latencyMs: expect.any(Number),
        reasoning: mockApiResponse.reasoning,
      },
    });
  });

  it('should route to PRO model for a complex task', async () => {
    const mockApiResponse = {
      reasoning: 'This is a complex task.',
      model_choice: 'pro',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);
    mockContext.request = [{ text: 'how do I build a spaceship?' }];

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockGenerateJson).toHaveBeenCalledOnce();
    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      metadata: {
        source: 'Classifier',
        latencyMs: expect.any(Number),
        reasoning: mockApiResponse.reasoning,
      },
    });
  });

  it('should return null if the classifier API call fails', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const testError = new Error('API Failure');
    mockGenerateJson.mockRejectedValue(testError);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('should return null if the classifier returns a malformed JSON object', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      reasoning: 'This is a simple task.',
      // model_choice is missing, which will cause a Zod parsing error.
    };
    mockGenerateJson.mockResolvedValue(malformedApiResponse);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('should filter out tool-related history before sending to classifier', async () => {
    mockContext.history = [
      { role: 'user', parts: [{ text: 'call a tool' }] },
      { role: 'model', parts: [{ functionCall: { name: 'test_tool' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'test_tool', response: { ok: true } } },
        ],
      },
      { role: 'user', parts: [{ text: 'another user turn' }] },
    ];
    const mockApiResponse = {
      reasoning: 'Simple.',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = mockGenerateJson.mock.calls[0][0];
    const contents = generateJsonCall.contents;

    const expectedContents = [
      { role: 'user', parts: [{ text: 'call a tool' }] },
      { role: 'user', parts: [{ text: 'another user turn' }] },
      { role: 'user', parts: [{ text: 'simple task' }] },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should respect HISTORY_SEARCH_WINDOW and HISTORY_TURNS_FOR_CONTEXT', async () => {
    const longHistory: Content[] = [];
    for (let i = 0; i < 30; i++) {
      longHistory.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
      // Add noise that should be filtered
      if (i % 2 === 0) {
        longHistory.push({
          role: 'model',
          parts: [{ functionCall: { name: 'noise', args: {} } }],
        });
      }
    }
    mockContext.history = longHistory;
    const mockApiResponse = {
      reasoning: 'Simple.',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = mockGenerateJson.mock.calls[0][0];
    const contents = generateJsonCall.contents;

    // Manually calculate what the history should be
    const HISTORY_SEARCH_WINDOW = 20;
    const HISTORY_TURNS_FOR_CONTEXT = 4;
    const historySlice = longHistory.slice(-HISTORY_SEARCH_WINDOW);
    const cleanHistory = historySlice.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (content: any) =>
        !content.parts?.[0]?.functionCall &&
        !content.parts?.[0]?.functionResponse,
    );
    const finalHistory = cleanHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    expect(contents).toEqual([
      ...finalHistory,
      { role: 'user', parts: mockContext.request },
    ]);
    // There should be 4 history items + the current request
    expect(contents).toHaveLength(5);
  });

  it('should use a fallback promptId if not found in context', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(promptIdContext, 'getStore').mockReturnValue(undefined);
    const mockApiResponse = {
      reasoning: 'Simple.',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = mockGenerateJson.mock.calls[0][0];

    expect(generateJsonCall.promptId).toMatch(
      /^classifier-router-fallback-\d+-\w+$/,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context for classifier-router. This is unexpected. Using a fallback ID:',
      ),
    );
    consoleWarnSpy.mockRestore();
  });

  it('should respect requestedModel from context in resolveClassifierModel', async () => {
    const requestedModel = DEFAULT_GEMINI_MODEL; // Pro model
    const mockApiResponse = {
      reasoning: 'Choice is flash',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    const contextWithRequestedModel = {
      ...mockContext,
      requestedModel,
    } as RoutingContext;

    const decision = await strategy.route(
      contextWithRequestedModel,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).not.toBeNull();
    // Since requestedModel is Pro, and choice is flash, it should resolve to Flash
    expect(decision?.model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
  });
});
