/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GemmaClassifierStrategy } from './gemmaClassifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import type { Content } from '@google/genai';
import { debugLogger } from '../../utils/debugLogger.js';
import type { LocalLiteRtLmClient } from '../../core/localLiteRtLmClient.js';

vi.mock('../../core/localLiteRtLmClient.js');

describe('GemmaClassifierStrategy', () => {
  let strategy: GemmaClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockLocalLiteRtLmClient: LocalLiteRtLmClient;
  let mockGenerateJson: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateJson = vi.fn();

    mockConfig = {
      getGemmaModelRouterSettings: vi.fn().mockReturnValue({ enabled: true }),
      getModel: () => DEFAULT_GEMINI_MODEL,
      getPreviewFeatures: () => false,
    } as unknown as Config;

    strategy = new GemmaClassifierStrategy();
    mockContext = {
      history: [],
      request: 'simple task',
      signal: new AbortController().signal,
    };

    mockBaseLlmClient = {} as BaseLlmClient;
    mockLocalLiteRtLmClient = {
      generateJson: mockGenerateJson,
    } as unknown as LocalLiteRtLmClient;
  });

  it('should return null if gemma model router is disabled', async () => {
    vi.mocked(mockConfig.getGemmaModelRouterSettings).mockReturnValue({
      enabled: false,
    });

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );
    expect(decision).toBeNull();
  });

  it('should call generateJson with the correct parameters', async () => {
    const mockApiResponse = {
      reasoning: 'Simple task',
      model_choice: 'flash',
    };
    mockGenerateJson.mockResolvedValue(mockApiResponse);

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(mockGenerateJson).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      expect.any(String),
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
      mockLocalLiteRtLmClient,
    );

    expect(mockGenerateJson).toHaveBeenCalledOnce();
    expect(decision).toEqual({
      model: DEFAULT_GEMINI_FLASH_MODEL,
      metadata: {
        source: 'GemmaClassifier',
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
    mockContext.request = 'how do I build a spaceship?';

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(mockGenerateJson).toHaveBeenCalledOnce();
    expect(decision).toEqual({
      model: DEFAULT_GEMINI_MODEL,
      metadata: {
        source: 'GemmaClassifier',
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
      mockLocalLiteRtLmClient,
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
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });

  it('should filter out tool-related history before sending to classifier', async () => {
    mockContext.history = [
      { role: 'user', parts: [{ text: 'call a tool' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'test_tool', args: {} } }],
      },
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

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    // Define a type for the arguments passed to the mock `generateJson`
    type GenerateJsonCall = [Content[], string, string | undefined];
    const calls = mockGenerateJson.mock.calls as GenerateJsonCall[];
    const contents = calls[0][0];
    const lastTurn = contents.at(-1);
    expect(lastTurn).toBeDefined();
    if (!lastTurn?.parts) {
      // Fail test if parts is not defined.
      expect(lastTurn?.parts).toBeDefined();
      return;
    }
    const expectedLastTurn = `You are provided with a **Chat History** and the user's **Current Request** below.

#### Chat History:
call a tool

another user turn

#### Current Request:
"simple task"
`;
    expect(lastTurn.parts.at(0)?.text).toEqual(expectedLastTurn);
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

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = mockGenerateJson.mock.calls[0][0];

    // There should be 1 item which is the flattened history.
    expect(generateJsonCall).toHaveLength(1);
  });
});
