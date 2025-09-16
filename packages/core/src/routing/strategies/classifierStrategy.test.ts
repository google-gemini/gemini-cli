/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassifierStrategy } from './classifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import {
  isFunctionCall,
  isFunctionResponse,
} from '../../utils/messageInspectors.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';

vi.mock('../../core/baseLlmClient.js');
vi.mock('../../utils/promptIdContext.js');

describe('ClassifierStrategy', () => {
  let strategy: ClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new ClassifierStrategy();
    mockContext = {
      history: [],
      request: [{ text: 'simple task' }],
      signal: new AbortController().signal,
    };
    mockConfig = {} as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;

    vi.mocked(promptIdContext.getStore).mockReturnValue('test-prompt-id');
  });

  it('should call generateJson with the correct parameters', async () => {
    const mockApiResponse = {
      reasoning: 'Simple task',
      model_choice: 'flash',
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        config: expect.objectContaining({
          temperature: 0,
          maxOutputTokens: 1024,
          thinkingConfig: {
            thinkingBudget: 512,
          },
        }),
        promptId: 'test-prompt-id',
      }),
    );
  });

  it('should route to FLASH model for a simple task', async () => {
    const mockApiResponse = {
      reasoning: 'This is a simple task.',
      model_choice: 'flash',
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledOnce();
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
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );
    mockContext.request = [{ text: 'how do I build a spaceship?' }];

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledOnce();
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
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const testError = new Error('API Failure');
    vi.mocked(mockBaseLlmClient.generateJson).mockRejectedValue(testError);

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
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      reasoning: 'This is a simple task.',
      // model_choice is missing, which will cause a Zod parsing error.
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      malformedApiResponse,
    );

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
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
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
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Manually calculate what the history should be
    const HISTORY_SEARCH_WINDOW = 20;
    const HISTORY_TURNS_FOR_CONTEXT = 4;
    const historySlice = longHistory.slice(-HISTORY_SEARCH_WINDOW);
    const cleanHistory = historySlice.filter(
      (content) => !isFunctionCall(content) && !isFunctionResponse(content),
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
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    vi.mocked(promptIdContext.getStore).mockReturnValue(undefined);
    const mockApiResponse = {
      reasoning: 'Simple.',
      model_choice: 'flash',
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall.promptId).toMatch(
      /^classifier-router-fallback-\d+-\w+$/,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context. This is unexpected. Using a fallback ID:',
      ),
    );
    consoleWarnSpy.mockRestore();
  });
});
