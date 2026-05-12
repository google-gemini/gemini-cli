/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NumericalClassifierStrategy,
  HISTORY_TURNS_FOR_CONTEXT,
} from './numericalClassifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import {
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { LocalLiteRtLmClient } from '../../core/localLiteRtLmClient.js';
import { AuthType } from '../../core/contentGenerator.js';

vi.mock('../../core/baseLlmClient.js');

describe('NumericalClassifierStrategy', () => {
  let strategy: NumericalClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockLocalLiteRtLmClient: LocalLiteRtLmClient;
  let mockResolvedConfig: ResolvedModelConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new NumericalClassifierStrategy();
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
      getModel: vi.fn().mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO),
      getSessionId: vi.fn().mockReturnValue('control-group-id'), // Default to Control Group (Hash 71 >= 50)
      getNumericalRoutingEnabled: vi.fn().mockResolvedValue(true),
      getResolvedClassifierThreshold: vi.fn().mockResolvedValue(90),
      getClassifierThreshold: vi.fn().mockResolvedValue(undefined),
      getGemini31Launched: vi.fn().mockResolvedValue(false),
      getGemini31FlashLiteLaunched: vi.fn().mockResolvedValue(false),
      getUseCustomToolModel: vi.fn().mockImplementation(async () => {
        const launched = await mockConfig.getGemini31Launched();
        const authType = mockConfig.getContentGeneratorConfig().authType;
        return launched && authType === AuthType.USE_GEMINI;
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
    } as unknown as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;
    mockLocalLiteRtLmClient = {} as LocalLiteRtLmClient;

    vi.spyOn(promptIdContext, 'getStore').mockReturnValue('test-prompt-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if numerical routing is disabled', async () => {
    vi.mocked(mockConfig.getNumericalRoutingEnabled).mockResolvedValue(false);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return null if the model is not a Gemini 3 model', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should return null if the model is explicitly a Gemini 2 model', async () => {
    vi.mocked(mockConfig.getModel).mockReturnValue(DEFAULT_GEMINI_MODEL);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should call generateJson with the correct parameters and wrapped user content', async () => {
    const mockApiResponse = {
      complexity_reasoning: 'Simple task',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall).toMatchObject({
      modelConfigKey: { model: mockResolvedConfig.model },
      promptId: 'test-prompt-id',
    });

    // Verify user content parts
    const userContent =
      generateJsonCall.contents[generateJsonCall.contents.length - 1];
    const textPart = userContent.parts?.[0];
    expect(textPart?.text).toBe('simple task');
  });

  describe('Default Logic', () => {
    it('should route to FLASH when score is below 90', async () => {
      const mockApiResponse = {
        complexity_reasoning: 'Standard task',
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'NumericalClassifier (Default)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 80 / Threshold: 90'),
        },
      });
    });

    it('should route to PRO when score is 90 or above', async () => {
      const mockApiResponse = {
        complexity_reasoning: 'Extreme task',
        complexity_score: 95,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_MODEL,
        metadata: {
          source: 'NumericalClassifier (Default)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 95 / Threshold: 90'),
        },
      });
    });
  });

  describe('Remote Threshold Logic', () => {
    it('should use the remote CLASSIFIER_THRESHOLD if provided (int value)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(70);
      vi.mocked(mockConfig.getResolvedClassifierThreshold).mockResolvedValue(
        70,
      );
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL, // Score 60 < Threshold 70
        metadata: {
          source: 'NumericalClassifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 70'),
        },
      });
    });

    it('should use the remote CLASSIFIER_THRESHOLD if provided (float value)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(45.5);
      vi.mocked(mockConfig.getResolvedClassifierThreshold).mockResolvedValue(
        45.5,
      );
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL, // Score 40 < Threshold 45.5
        metadata: {
          source: 'NumericalClassifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 45.5'),
        },
      });
    });

    it('should use PRO model if score >= remote CLASSIFIER_THRESHOLD', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(30);
      vi.mocked(mockConfig.getResolvedClassifierThreshold).mockResolvedValue(
        30,
      );
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 35,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_MODEL, // Score 35 >= Threshold 30
        metadata: {
          source: 'NumericalClassifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 35 / Threshold: 30'),
        },
      });
    });

    it('should fall back to default logic if CLASSIFIER_THRESHOLD is not present in experiments', async () => {
      // Mock getClassifierThreshold to return undefined
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(undefined);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL, // Score 80 < Default Threshold 90
        metadata: {
          source: 'NumericalClassifier (Default)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 80 / Threshold: 90'),
        },
      });
    });

    it('should fall back to default logic if CLASSIFIER_THRESHOLD is out of range (less than 0)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(-10);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'NumericalClassifier (Default)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 80 / Threshold: 90'),
        },
      });
    });

    it('should fall back to default logic if CLASSIFIER_THRESHOLD is out of range (greater than 100)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(110);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 95,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_MODEL,
        metadata: {
          source: 'NumericalClassifier (Default)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 95 / Threshold: 90'),
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
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should return null if the classifier returns a malformed JSON object', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      complexity_reasoning: 'This is a simple task.',
      // complexity_score is missing
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      malformedApiResponse,
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should strip leading tool turns when history starts with tool calls', async () => {
    const history: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'leading_tool' } }] },
      {
        role: 'user',
        parts: [
          {
            functionResponse: { name: 'leading_tool', response: { ok: true } },
          },
        ],
      },
      { role: 'model', parts: [{ text: 'text response 1' }] },
      { role: 'user', parts: [{ text: 'text request 2' }] },
    ];
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect leading tool turns (index 0 and 1) to be stripped, keeping only text turns (index 2 and 3)
    const expectedContents = [
      ...history.slice(2),
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should preserve tool turns when they appear after a non-tool turn in the middle of history', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'turn 0 (before)' }] },
      { role: 'model', parts: [{ text: 'turn 1 (before)' }] },
      { role: 'user', parts: [{ text: 'turn 2 (before)' }] },
      { role: 'model', parts: [{ text: 'turn 3 (before)' }] },
      { role: 'model', parts: [{ functionCall: { name: 'middle_tool' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'middle_tool', response: { ok: true } } },
        ],
      },
      { role: 'model', parts: [{ text: 'turn 6 (after)' }] },
      { role: 'user', parts: [{ text: 'turn 7 (after)' }] },
      { role: 'model', parts: [{ text: 'turn 8 (after)' }] },
      { role: 'user', parts: [{ text: 'turn 9 (after)' }] },
    ];
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect all 8 sliced turns (starting from non-tool turn 2) to be preserved
    const expectedContents = [
      ...history.slice(2),
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should preserve tool turns when they appear at the very end of history following a non-tool turn', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'turn 0' }] },
      { role: 'model', parts: [{ text: 'turn 1' }] },
      { role: 'user', parts: [{ text: 'turn 2' }] },
      { role: 'model', parts: [{ text: 'turn 3' }] },
      { role: 'user', parts: [{ text: 'turn 4' }] },
      { role: 'model', parts: [{ text: 'turn 5' }] },
      { role: 'user', parts: [{ text: 'turn 6' }] },
      { role: 'model', parts: [{ text: 'turn 7' }] },
      { role: 'model', parts: [{ functionCall: { name: 'end_tool' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'end_tool', response: { ok: true } } },
        ],
      },
    ];
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect all 8 sliced turns to be preserved because index 2 is a non-tool turn
    const expectedContents = [
      ...history.slice(2),
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should send only the new request prompt if the entire history consists of tool-related turns', async () => {
    const history: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'tool_A' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool_A', response: { ok: true } } },
        ],
      },
      { role: 'model', parts: [{ functionCall: { name: 'tool_B' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool_B', response: { ok: true } } },
        ],
      },
    ];
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple standalone task.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect all history turns to be filtered out, leaving exactly just the new request
    const expectedContents = [
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should respect HISTORY_TURNS_FOR_CONTEXT correctly when history has only text turns', async () => {
    const history: Content[] = [];
    for (let i = 0; i < HISTORY_TURNS_FOR_CONTEXT + 2; i++) {
      history.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
    }
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect exactly the last 8 turns (history.slice(2))
    expect(contents).toEqual([
      ...history.slice(2),
      { role: 'user', parts: [{ text: 'simple task' }] },
    ]);
    expect(contents).toHaveLength(HISTORY_TURNS_FOR_CONTEXT + 1);
  });

  it('should respect HISTORY_TURNS_FOR_CONTEXT correctly when history starts with tool calls', async () => {
    const history: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'tool_0' } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'tool_0', response: { ok: true } } },
        ],
      },
    ];
    for (let i = 0; i < HISTORY_TURNS_FOR_CONTEXT; i++) {
      history.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
    }
    mockContext.history = history;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // Expect exactly the last 8 text turns (history.slice(2))
    expect(contents).toEqual([
      ...history.slice(2),
      { role: 'user', parts: [{ text: 'simple task' }] },
    ]);
    expect(contents).toHaveLength(HISTORY_TURNS_FOR_CONTEXT + 1);
  });

  it('should use a fallback promptId if not found in context', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(promptIdContext, 'getStore').mockReturnValue(undefined);
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall.promptId).toMatch(
      /^classifier-router-fallback-\d+-\w+$/,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context for classifier-router. This is unexpected. Using a fallback ID:',
      ),
    );
  });

  describe('Gemini 3.1 and Custom Tools Routing', () => {
    it('should route to PREVIEW_GEMINI_3_1_MODEL when Gemini 3.1 is launched', async () => {
      vi.mocked(mockConfig.getGemini31Launched).mockResolvedValue(true);
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
        complexity_score: 95,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision?.model).toBe(PREVIEW_GEMINI_3_1_MODEL);
    });
    it('should route to PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL when Gemini 3.1 is launched and auth is USE_GEMINI', async () => {
      vi.mocked(mockConfig.getGemini31Launched).mockResolvedValue(true);
      vi.mocked(mockConfig.getContentGeneratorConfig).mockReturnValue({
        authType: AuthType.USE_GEMINI,
      });
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
        complexity_score: 95,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision?.model).toBe(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL);
    });

    it('should NOT route to custom tools model when auth is USE_VERTEX_AI', async () => {
      vi.mocked(mockConfig.getGemini31Launched).mockResolvedValue(true);
      vi.mocked(mockConfig.getContentGeneratorConfig).mockReturnValue({
        authType: AuthType.USE_VERTEX_AI,
      });
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
        complexity_score: 95,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
        mockLocalLiteRtLmClient,
      );

      expect(decision?.model).toBe(PREVIEW_GEMINI_3_1_MODEL);
    });
  });
});
