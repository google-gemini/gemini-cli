/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NumericalClassifierStrategy } from './numericalClassifierStrategy.js';
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
import { AuthType } from '../../core/contentGenerator.js';

vi.mock('../../core/baseLlmClient.js');

describe('NumericalClassifierStrategy', () => {
  let strategy: NumericalClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
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
      getClassifierThreshold: vi.fn().mockResolvedValue(undefined),
      getGemini31Launched: vi.fn().mockResolvedValue(false),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
    } as unknown as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;

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

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

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

  describe('A/B Testing Logic (Deterministic)', () => {
    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 40 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Hash 71 -> Control
      const mockApiResponse = {
        complexity_reasoning: 'Standard task',
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
        model: PREVIEW_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'NumericalClassifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 60 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
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
        model: PREVIEW_GEMINI_MODEL,
        metadata: {
          source: 'NumericalClassifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 60 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1'); // FNV Normalized 18 < 50 -> Strict
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
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
        model: PREVIEW_GEMINI_FLASH_MODEL, // Routed to Flash because 60 < 80
        metadata: {
          source: 'NumericalClassifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 80'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 90 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1');
      const mockApiResponse = {
        complexity_reasoning: 'Extreme task',
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
        model: PREVIEW_GEMINI_MODEL,
        metadata: {
          source: 'NumericalClassifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 90 / Threshold: 80'),
        },
      });
    });
  });

  describe('Remote Threshold Logic', () => {
    it('should use the remote CLASSIFIER_THRESHOLD if provided (int value)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(70);
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

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is not present in experiments', async () => {
      // Mock getClassifierThreshold to return undefined
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(undefined);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Should resolve to Control (50)
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
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL, // Score 40 < Default A/B Threshold 50
        metadata: {
          source: 'NumericalClassifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (less than 0)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(-10);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
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
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'NumericalClassifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (greater than 100)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(110);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
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
      );

      expect(decision).toEqual({
        model: PREVIEW_GEMINI_MODEL,
        metadata: {
          source: 'NumericalClassifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
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
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should include tool-related history when sending to classifier', async () => {
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
      complexity_reasoning: 'Simple.',
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
      ...mockContext.history,
      // The last user turn is the request part
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];

    expect(contents).toEqual(expectedContents);
  });

  it('should respect HISTORY_TURNS_FOR_CONTEXT', async () => {
    const longHistory: Content[] = [];
    for (let i = 0; i < 30; i++) {
      longHistory.push({ role: 'user', parts: [{ text: `Message ${i}` }] });
    }
    mockContext.history = longHistory;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
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
    const HISTORY_TURNS_FOR_CONTEXT = 8;
    const finalHistory = longHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    // Last part is the request
    const requestPart = {
      role: 'user',
      parts: [{ text: 'simple task' }],
    };

    expect(contents).toEqual([...finalHistory, requestPart]);
    expect(contents).toHaveLength(9);
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

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

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
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
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
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
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
        complexity_score: 80,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision?.model).toBe(PREVIEW_GEMINI_3_1_MODEL);
    });
  });
});
