/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';

vi.mock('../../core/baseLlmClient.js');
vi.mock('../../utils/promptIdContext.js');

describe('ClassifierStrategy', () => {
  let strategy: ClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockResolvedConfig: ResolvedModelConfig;

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
    mockConfig = {
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue(mockResolvedConfig),
      },
      getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      getPreviewFeatures: () => false,
    } as unknown as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;

    vi.mocked(promptIdContext.getStore).mockReturnValue('test-prompt-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call generateJson with the correct parameters', async () => {
    const mockApiResponse = {
      reasoning: 'Simple task',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // Control Group (>= 0.5 is strict? No, < 0.5 is strict. Wait. Code says < 0.5 is strict.)
    // Code: const isStrict = Math.random() < 0.5;
    // So 0.9 is >= 0.5, so NOT strict -> Control.

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    expect(mockBaseLlmClient.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        modelConfigKey: { model: mockResolvedConfig.model },
        promptId: 'test-prompt-id',
      }),
    );
  });

  describe('A/B Testing Logic', () => {
    it('Control Group (Threshold 50): Score 40 -> FLASH', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6); // >= 0.5 -> Control
      const mockApiResponse = {
        reasoning: 'Standard task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('Control Group (Threshold 50): Score 60 -> PRO', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6); // >= 0.5 -> Control
      const mockApiResponse = {
        reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });

    it('Strict Group (Threshold 80): Score 60 -> FLASH', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 -> Strict
      const mockApiResponse = {
        reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Routed to Flash because 60 < 80
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 80'),
        },
      });
    });

    it('Strict Group (Threshold 80): Score 90 -> PRO', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 -> Strict
      const mockApiResponse = {
        reasoning: 'Extreme task',
        complexity_score: 90,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 90 / Threshold: 80'),
        },
      });
    });
  });

  it('should return null if the classifier API call fails', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
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
  });

  it('should return null if the classifier returns a malformed JSON object', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      reasoning: 'This is a simple task.',
      // complexity_score is missing
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
      complexity_score: 10,
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
      complexity_score: 10,
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
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    vi.mocked(promptIdContext.getStore).mockReturnValue(undefined);
    const mockApiResponse = {
      reasoning: 'Simple.',
      complexity_score: 10,
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
  });
});
