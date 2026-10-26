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
  LATEST_GEMINI_FLASH_MODEL,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { Content } from '@google/genai';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';
import type { LocalLiteRtLmClient } from '../../core/localLiteRtLmClient.js';
import { AuthType } from '../../core/contentGenerator.js';
import { ModelAvailabilityService } from '../../availability/modelAvailabilityService.js';

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
      hasCustomNumericalRoutingRules: vi.fn().mockReturnValue(false),
      getNumericalRoutingRules: vi.fn().mockReturnValue([]),
      getResolvedClassifierThreshold: vi.fn().mockResolvedValue(90),
      getClassifierThreshold: vi.fn().mockResolvedValue(undefined),
      getGemini31Launched: vi.fn().mockResolvedValue(false),
      getUseCustomToolModel: vi.fn().mockImplementation(async () => {
        const launched = await mockConfig.getGemini31Launched();
        const authType = mockConfig.getContentGeneratorConfig().authType;
        return launched && authType === AuthType.USE_GEMINI;
      }),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: AuthType.LOGIN_WITH_GOOGLE,
      }),
      getModelAvailabilityService: vi
        .fn()
        .mockReturnValue(new ModelAvailabilityService()),
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

  describe('Custom Numerical Routing Rules', () => {
    describe('Range Boundaries', () => {
      beforeEach(() => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 10, model: 'local-gemma' },
          { maxScore: 30, model: 'gemini-2.5-flash' },
          { maxScore: 80, model: 'gemini-3-flash-preview' },
          { maxScore: 100, model: 'gemini-3-pro-preview' },
        ]);
      });

      it('routes lower bound score (1) to the first band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Minimal complexity',
          complexity_score: 1,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision).toEqual({
          model: 'local-gemma',
          metadata: {
            source: 'NumericalClassifier (Custom)',
            latencyMs: expect.any(Number),
            reasoning:
              '[Score: 1 / Max score: 10 / Model: local-gemma] Minimal complexity',
          },
        });
      });

      it('routes exact upper boundary of first band (10) to the first band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Simple task',
          complexity_score: 10,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('local-gemma');
        expect(decision?.metadata.source).toBe('NumericalClassifier (Custom)');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 10 / Max score: 10 / Model: local-gemma]',
        );
      });

      it('routes just above boundary (11) to the second band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Slightly more than trivial',
          complexity_score: 11,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 11 / Max score: 30 / Model: gemini-2.5-flash]',
        );
      });

      it('routes exact boundary (30) to the second band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Moderate task',
          complexity_score: 30,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 30 / Max score: 30 / Model: gemini-2.5-flash]',
        );
      });

      it('routes exact boundary (80) to the third band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'High complexity task',
          complexity_score: 80,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-3-flash-preview');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 80 / Max score: 80 / Model: gemini-3-flash-preview]',
        );
      });

      it('routes just above boundary (81) to the fourth band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Very complex task',
          complexity_score: 81,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-3-pro-preview');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 81 / Max score: 100 / Model: gemini-3-pro-preview]',
        );
      });

      it('routes maximum score (100) to the fourth band', async () => {
        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Maximum complexity',
          complexity_score: 100,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-3-pro-preview');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 100 / Max score: 100 / Model: gemini-3-pro-preview]',
        );
      });
    });

    describe('Unordered Rules', () => {
      it('correctly sorts rules by maxScore ascending before matching', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 80, model: 'gemini-3-flash-preview' },
          { maxScore: 10, model: 'local-gemma' },
          { maxScore: 30, model: 'gemini-2.5-flash' },
          { maxScore: 100, model: 'gemini-3-pro-preview' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Task with score 25',
          complexity_score: 25,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 25 / Max score: 30 / Model: gemini-2.5-flash]',
        );
      });
    });

    describe('Fallback Behavior', () => {
      it('falls back to the final band model when score exceeds all configured max scores', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 10, model: 'gemini-2.5-flash-lite' },
          { maxScore: 50, model: 'gemini-2.5-flash' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Score above all rules',
          complexity_score: 75,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
        expect(decision?.metadata.source).toBe('NumericalClassifier (Custom)');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 75 / Above final max score: 50 / Model: gemini-2.5-flash]',
        );
      });

      it('falls back to default Flash/Pro threshold routing when custom rules array is empty', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([]);
        vi.mocked(mockConfig.getResolvedClassifierThreshold).mockResolvedValue(
          90,
        );

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Standard task',
          complexity_score: 50,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);
        expect(decision?.metadata.source).toBe('NumericalClassifier (Default)');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 50 / Threshold: 90]',
        );
      });

      it('filters out invalid rules and uses remaining valid rules', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: NaN, model: 'invalid-model' },
          { maxScore: -10, model: 'negative-score-model' },
          { maxScore: 150, model: 'out-of-range-model' },
          { maxScore: 20, model: '' },
          { maxScore: 40, model: 'gemini-2.5-flash' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Valid rule match',
          complexity_score: 35,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
        expect(decision?.metadata.source).toBe('NumericalClassifier (Custom)');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 35 / Max score: 40 / Model: gemini-2.5-flash]',
        );
      });

      it('falls back to default Flash/Pro routing when all configured rules are invalid', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: NaN, model: 'invalid' },
          { maxScore: 0, model: 'zero-max-score' },
          { maxScore: 50, model: '   ' },
        ]);
        vi.mocked(mockConfig.getResolvedClassifierThreshold).mockResolvedValue(
          90,
        );

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Fall back to default',
          complexity_score: 95,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe(PREVIEW_GEMINI_MODEL);
        expect(decision?.metadata.source).toBe('NumericalClassifier (Default)');
        expect(decision?.metadata.reasoning).toContain(
          '[Score: 95 / Threshold: 90]',
        );
      });

      it('bypasses (returns null) when selected custom model is unavailable in ModelAvailabilityService', async () => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 50, model: 'unavailable-model' },
        ]);

        const availabilityService = new ModelAvailabilityService();
        vi.spyOn(availabilityService, 'snapshot').mockReturnValue({
          available: false,
          reason: 'quota',
        });
        vi.mocked(mockConfig.getModelAvailabilityService).mockReturnValue(
          availabilityService,
        );

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Task with unavailable model',
          complexity_score: 30,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision).toBeNull();
      });
    });

    describe('Model Resolution and Aliases', () => {
      beforeEach(() => {
        vi.mocked(mockConfig.hasCustomNumericalRoutingRules).mockReturnValue(
          true,
        );
      });

      it('resolves model aliases like "flash" and "pro"', async () => {
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 40, model: 'flash' },
          { maxScore: 100, model: 'pro' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Alias test flash',
          complexity_score: 20,
        });

        const decisionFlash = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decisionFlash?.model).toBe(PREVIEW_GEMINI_FLASH_MODEL);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Alias test pro',
          complexity_score: 80,
        });

        const decisionPro = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decisionPro?.model).toBe(PREVIEW_GEMINI_MODEL);
      });

      it('normalizes model identifiers with models/ prefix', async () => {
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 100, model: 'models/gemini-2.5-flash' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Models prefix test',
          complexity_score: 50,
        });

        const decision = await strategy.route(
          mockContext,
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-flash');
      });

      it('applies custom rules even when requestedModel is not Gemini 3', async () => {
        vi.mocked(mockConfig.getModel).mockReturnValue('gemini-2.5-flash');
        vi.mocked(mockConfig.getNumericalRoutingRules).mockReturnValue([
          { maxScore: 50, model: 'gemini-2.5-flash-lite' },
          { maxScore: 100, model: 'gemini-2.5-pro' },
        ]);

        vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue({
          complexity_reasoning: 'Non-gemini-3 base model test',
          complexity_score: 80,
        });

        const decision = await strategy.route(
          { ...mockContext, requestedModel: 'gemini-2.5-flash' },
          mockConfig,
          mockBaseLlmClient,
          mockLocalLiteRtLmClient,
        );

        expect(decision?.model).toBe('gemini-2.5-pro');
        expect(decision?.metadata.source).toBe('NumericalClassifier (Custom)');
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

  it('should return null (bypass classifier) if history is only tool turns and request is a function response', async () => {
    const history: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'tool' } }] },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'tool', response: { ok: true } } }],
      },
      { role: 'model', parts: [{ functionCall: { name: 'tool2' } }] },
    ];
    mockContext.history = history;
    mockContext.request = [
      { functionResponse: { name: 'tool2', response: { ok: true } } },
    ];

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
      mockLocalLiteRtLmClient,
    );

    expect(decision).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should still route if history is only tool turns but request is text', async () => {
    const history: Content[] = [
      { role: 'model', parts: [{ functionCall: { name: 'tool' } }] },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'tool', response: { ok: true } } }],
      },
      { role: 'model', parts: [{ functionCall: { name: 'tool2' } }] },
    ];
    mockContext.history = history;
    mockContext.request = [{ text: 'simple task' }];

    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
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

    expect(decision).not.toBeNull();
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalled();

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];
    const contents = generateJsonCall.contents;

    // History should be empty because all turns were tool turns and stripped.
    // Request should be present.
    const expectedContents = [
      {
        role: 'user',
        parts: [{ text: 'simple task' }],
      },
    ];
    expect(contents).toEqual(expectedContents);
  });

  it('should still route if history has text turns and request is a function response', async () => {
    const history: Content[] = [
      { role: 'user', parts: [{ text: 'some task' }] },
      { role: 'model', parts: [{ functionCall: { name: 'tool' } }] },
    ];
    mockContext.history = history;
    mockContext.request = [
      { functionResponse: { name: 'tool', response: { ok: true } } },
    ];

    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
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

    expect(decision).not.toBeNull();
    expect(mockBaseLlmClient.generateJson).toHaveBeenCalled();
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

    it('should route to LATEST_GEMINI_FLASH_MODEL when hasLatestFlashGAAccess is true', async () => {
      mockConfig.hasLatestFlashGAAccess = vi.fn().mockReturnValue(true);
      vi.mocked(mockConfig.getModel).mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO);

      const mockApiResponse = {
        complexity_reasoning: 'Simple task',
        complexity_score: 10,
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

      expect(decision?.model).toBe(LATEST_GEMINI_FLASH_MODEL);
    });
  });
});
