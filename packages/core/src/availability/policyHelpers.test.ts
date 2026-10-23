/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePolicyChain,
  buildFallbackPolicyContext,
  applyModelSelection,
  applyAvailabilityTransition,
  markQuotaExhausted,
  resolveQuotaFallbackModel,
  selectModelForAvailability,
} from './policyHelpers.js';
import { ModelAvailabilityService } from './modelAvailabilityService.js';
import { createDefaultPolicy, SILENT_ACTIONS } from './policyCatalog.js';
import type { RetryAvailabilityContext } from './modelPolicy.js';
import type { Config } from '../config/config.js';
import type { BucketInfo } from '../code_assist/types.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  BASE_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  LEGACY_CCPA_FLASH_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  resetModelsForTesting,
} from '../config/models.js';
import { AuthType } from '../core/contentGenerator.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from '../config/defaultModelConfigs.js';
import { ApprovalMode } from '../policy/types.js';

const createMockConfig = (overrides: Partial<Config> = {}): Config => {
  const config = {
    getUserTier: () => undefined,
    getModel: () => 'gemini-2.5-pro',
    getGemini31LaunchedSync: () => false,
    getUseCustomToolModelSync: () => {
      const useGemini31 = config.getGemini31LaunchedSync();
      const authType = config.getContentGeneratorConfig().authType;
      return useGemini31 && authType === AuthType.USE_GEMINI;
    },
    getContentGeneratorConfig: () => ({ authType: undefined }),
    getHasAccessToPreviewModel: () => true,
    getMaxAttemptsPerTurn: () => 3,
    getExperimentalDynamicModelConfiguration: () => false,
    getReleaseChannel: () => 'preview',
    modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
    ...overrides,
  } as unknown as Config;
  return config;
};

describe('policyHelpers', () => {
  beforeEach(() => {
    resetModelsForTesting();
  });

  afterEach(() => {
    resetModelsForTesting();
  });

  describe('resolvePolicyChain', () => {
    it('returns a single-model chain for a custom model', () => {
      const config = createMockConfig({
        getModel: () => 'custom-model',
      });
      const chain = resolvePolicyChain(config);
      expect(chain).toHaveLength(1);
      expect(chain[0]?.model).toBe('custom-model');
    });

    it('leaves catalog order untouched when active model already present', () => {
      const config = createMockConfig({
        getModel: () => 'gemini-2.5-pro',
      });
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
    });

    it('returns the default chain when active model is "auto"', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config);

      // Expect default chain [Pro, Flash]
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
    });

    it('uses auto chain when preferred model is auto', () => {
      const config = createMockConfig({
        getModel: () => 'gemini-2.5-pro',
      });
      const chain = resolvePolicyChain(config, DEFAULT_GEMINI_MODEL_AUTO);
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
    });

    it('uses auto chain when configured model is auto even if preferred is concrete', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, 'gemini-2.5-pro');
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
    });

    it('starts chain from preferredModel when model is "auto"', () => {
      const config = createMockConfig({
        getModel: () => 'auto',
      });
      const chain = resolvePolicyChain(config, BASE_GEMINI_FLASH_MODEL);
      // Due to Gemini 2.x wrapsAround, the chain will contain both flash and pro
      expect(chain.length).toBeGreaterThanOrEqual(1);
      expect(chain[0]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
    });

    it('returns flash-lite chain when preferred model is flash-lite', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, DEFAULT_GEMINI_FLASH_LITE_MODEL);
      expect(chain).toHaveLength(3);
      expect(chain[0]?.model).toBe('gemini-3.1-flash-lite');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
      expect(chain[2]?.model).toBe('gemini-2.5-pro');
    });

    it('returns flash-lite chain when configured model is flash-lite', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_FLASH_LITE_MODEL,
      });
      const chain = resolvePolicyChain(config);
      expect(chain).toHaveLength(3);
      expect(chain[0]?.model).toBe('gemini-3.1-flash-lite');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
      expect(chain[2]?.model).toBe('gemini-2.5-pro');
    });

    it('wraps around the chain when wrapsAround is true', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, BASE_GEMINI_FLASH_MODEL, true);
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
      expect(chain[1]?.model).toBe('gemini-2.5-pro');
    });

    it('proactively returns Gemini 2.5 chain if Gemini 3 requested but user lacks access', () => {
      const config = createMockConfig({
        getModel: () => 'auto-gemini-3',
        getHasAccessToPreviewModel: () => false,
      });
      const chain = resolvePolicyChain(config);

      // Should downgrade to [Pro 2.5, Flash 3.5]
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe(BASE_GEMINI_FLASH_MODEL);
    });

    it('returns Gemini 3.1 Pro chain when launched and auto-gemini-3 requested', () => {
      const config = createMockConfig({
        getModel: () => 'auto-gemini-3',
        getGemini31LaunchedSync: () => true,
      });
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe(PREVIEW_GEMINI_3_1_MODEL);
      expect(chain[1]?.model).toBe('gemini-3-flash-preview');
    });

    it('returns Gemini 3.1 Pro Custom Tools chain when launched, auth is Gemini, and auto-gemini-3 requested', () => {
      const config = createMockConfig({
        getModel: () => 'auto-gemini-3',
        getGemini31LaunchedSync: () => true,
        getContentGeneratorConfig: () => ({ authType: AuthType.USE_GEMINI }),
      });
      const chain = resolvePolicyChain(config);
      expect(chain[0]?.model).toBe(PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL);
      expect(chain[1]?.model).toBe('gemini-3-flash-preview');
    });

    it('applies SILENT_ACTIONS when ApprovalMode is PLAN', () => {
      const config = createMockConfig({
        getApprovalMode: () => ApprovalMode.PLAN,
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config);

      expect(chain).toHaveLength(2);
      expect(chain[0]?.actions).toEqual(SILENT_ACTIONS);
      expect(chain[1]?.actions).toEqual(SILENT_ACTIONS);
    });
  });

  describe('resolvePolicyChain behavior is identical between dynamic and legacy implementations', () => {
    const testCases = [
      { name: 'Default Auto', model: DEFAULT_GEMINI_MODEL_AUTO },
      { name: 'Gemini 3 Auto', model: 'auto-gemini-3' },
      { name: 'Unified Auto', model: 'auto' },
      { name: 'Flash Lite', model: DEFAULT_GEMINI_FLASH_LITE_MODEL },
      {
        name: 'Gemini 3 Auto (3.1 Enabled)',
        model: 'auto-gemini-3',
        useGemini31: true,
      },
      {
        name: 'Gemini 3 Auto (3.1 + Custom Tools)',
        model: 'auto-gemini-3',
        useGemini31: true,
        authType: AuthType.USE_GEMINI,
      },
      {
        name: 'Gemini 3 Auto (No Access)',
        model: 'auto-gemini-3',
        hasAccess: false,
      },
      { name: 'Concrete Model (2.5 Pro)', model: 'gemini-2.5-pro' },
      { name: 'Explicit Gemini 3', model: 'gemini-3-pro-preview' },
      { name: 'Custom Model', model: 'my-custom-model' },
      {
        name: 'Wrap Around',
        model: DEFAULT_GEMINI_MODEL_AUTO,
        wrapsAround: true,
      },
    ];

    testCases.forEach(
      ({ name, model, useGemini31, hasAccess, authType, wrapsAround }) => {
        it(`achieves parity for: ${name}`, () => {
          const createBaseConfig = (dynamic: boolean) =>
            createMockConfig({
              getExperimentalDynamicModelConfiguration: () => dynamic,
              getModel: () => model,
              getGemini31LaunchedSync: () => useGemini31 ?? false,
              getHasAccessToPreviewModel: () => hasAccess ?? true,
              getContentGeneratorConfig: () => ({ authType }),
              getReleaseChannel: () => 'preview',
              modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
            });

          const legacyChain = resolvePolicyChain(
            createBaseConfig(false),
            model,
            wrapsAround,
          );
          const dynamicChain = resolvePolicyChain(
            createBaseConfig(true),
            model,
            wrapsAround,
          );

          expect(dynamicChain).toEqual(legacyChain);
        });
      },
    );
  });

  describe('buildFallbackPolicyContext', () => {
    it('returns remaining candidates after the failed model', () => {
      const chain = [
        createDefaultPolicy('a'),
        createDefaultPolicy('b'),
        createDefaultPolicy('c'),
      ];
      const context = buildFallbackPolicyContext(chain, 'b');
      expect(context.failedPolicy?.model).toBe('b');
      expect(context.candidates.map((p) => p.model)).toEqual(['c']);
    });

    it('wraps around when building fallback context if wrapsAround is true', () => {
      const chain = [
        createDefaultPolicy('a'),
        createDefaultPolicy('b'),
        createDefaultPolicy('c'),
      ];
      const context = buildFallbackPolicyContext(chain, 'b', true);
      expect(context.failedPolicy?.model).toBe('b');
      expect(context.candidates.map((p) => p.model)).toEqual(['c', 'a']);
    });

    it('returns full chain when model is not in policy list', () => {
      const chain = [createDefaultPolicy('a'), createDefaultPolicy('b')];
      const context = buildFallbackPolicyContext(chain, 'x');
      expect(context.failedPolicy).toBeUndefined();
      expect(context.candidates).toEqual(chain);
    });
  });

  describe('applyModelSelection', () => {
    const mockModelConfigService = {
      getResolvedConfig: vi.fn(),
    };

    const mockAvailabilityService = {
      selectFirstAvailable: vi.fn(),
      consumeStickyAttempt: vi.fn(),
    };

    const createExtendedMockConfig = (
      overrides: Partial<Config> = {},
    ): Config => {
      const defaults = {
        getModelAvailabilityService: () => mockAvailabilityService,
        setActiveModel: vi.fn(),
        modelConfigService: mockModelConfigService,
      };
      return createMockConfig({ ...defaults, ...overrides } as Partial<Config>);
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns requested model if it is available', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {},
      });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
      });

      const result = applyModelSelection(config, {
        model: 'gemini-pro',
        isChatModel: true,
      });
      expect(result.model).toBe('gemini-pro');
      expect(result.maxAttempts).toBeUndefined();
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-pro');
    });

    it('switches to backup model and updates config if requested is unavailable', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig
        .mockReturnValueOnce({
          model: 'gemini-pro',
          generateContentConfig: { temperature: 0.9, topP: 1 },
        })
        .mockReturnValueOnce({
          model: 'gemini-flash',
          generateContentConfig: { temperature: 0.1, topP: 1 },
        });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-flash',
      });

      const result = applyModelSelection(config, {
        model: 'gemini-pro',
        isChatModel: true,
      });

      expect(result.model).toBe('gemini-flash');
      expect(result.config).toEqual({
        temperature: 0.1,
        topP: 1,
      });

      expect(mockModelConfigService.getResolvedConfig).toHaveBeenCalledWith({
        model: 'gemini-pro',
        isChatModel: true,
      });
      expect(mockModelConfigService.getResolvedConfig).toHaveBeenCalledWith({
        model: 'gemini-flash',
        isChatModel: true,
      });
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-flash');
    });

    it('does not call setActiveModel if isChatModel is false', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {},
      });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
      });

      applyModelSelection(config, {
        model: 'gemini-pro',
        isChatModel: false,
      });
      expect(config.setActiveModel).not.toHaveBeenCalled();
    });

    it('consumes sticky attempt if indicated and isChatModel is true', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {},
      });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
        attempts: 1,
      });

      const result = applyModelSelection(config, {
        model: 'gemini-pro',
        isChatModel: true,
      });
      expect(mockAvailabilityService.consumeStickyAttempt).toHaveBeenCalledWith(
        'gemini-pro',
      );
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-pro');
      expect(result.maxAttempts).toBe(1);
    });

    it('consumes sticky attempt if indicated but does not call setActiveModel if isChatModel is false', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {},
      });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
        attempts: 1,
      });

      const result = applyModelSelection(config, {
        model: 'gemini-pro',
        isChatModel: false,
      });
      expect(mockAvailabilityService.consumeStickyAttempt).toHaveBeenCalledWith(
        'gemini-pro',
      );
      expect(config.setActiveModel).not.toHaveBeenCalled();
      expect(result.maxAttempts).toBe(1);
    });

    it('does not consume sticky attempt if consumeAttempt is false', () => {
      const config = createExtendedMockConfig();
      mockModelConfigService.getResolvedConfig.mockReturnValue({
        model: 'gemini-pro',
        generateContentConfig: {},
      });
      mockAvailabilityService.selectFirstAvailable.mockReturnValue({
        selectedModel: 'gemini-pro',
        attempts: 1,
      });

      const result = applyModelSelection(
        config,
        { model: 'gemini-pro', isChatModel: true },
        {
          consumeAttempt: false,
        },
      );
      expect(
        mockAvailabilityService.consumeStickyAttempt,
      ).not.toHaveBeenCalled();
      expect(config.setActiveModel).toHaveBeenCalledWith('gemini-pro');
      expect(result.maxAttempts).toBe(1);
    });
  });

  describe('applyAvailabilityTransition', () => {
    it('marks terminal on terminal transition', () => {
      const mockService = { markTerminal: vi.fn() };
      const context = {
        service: mockService,
        policy: {
          model: 'test-model',
          stateTransitions: { transient: 'terminal' },
        },
      };
      const getContext = () => context as unknown as RetryAvailabilityContext;

      applyAvailabilityTransition(getContext, 'transient');

      expect(mockService.markTerminal).toHaveBeenCalledWith(
        'test-model',
        'capacity',
      );
    });

    it('marks sticky and consumes on sticky_retry transition', () => {
      const mockService = {
        markRetryOncePerTurn: vi.fn(),
        consumeStickyAttempt: vi.fn(),
      };
      const context = {
        service: mockService,
        policy: {
          model: 'test-model',
          stateTransitions: { transient: 'sticky_retry' },
          maxAttempts: 3,
        },
      };
      const getContext = () => context as unknown as RetryAvailabilityContext;

      applyAvailabilityTransition(getContext, 'transient');

      expect(mockService.markRetryOncePerTurn).toHaveBeenCalledWith(
        'test-model',
        3,
      );
      expect(mockService.consumeStickyAttempt).toHaveBeenCalledWith(
        'test-model',
      );
    });
  });
});

function fixture(
  selected: string,
  buckets: BucketInfo[] = [],
  overrides: Partial<Config> = {},
) {
  const availability = new ModelAvailabilityService();
  let active = selected;
  const config = {
    getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
    getActiveModel: () => active,
    setActiveModel: vi.fn((model: string) => {
      active = model;
    }),
    getModelAvailabilityService: () => availability,
    getUserTier: () => undefined,
    getContentGeneratorConfig: () => ({ authType: 'oauth-personal' }),
    getHasAccessToPreviewModel: () => false,
    getGemini31LaunchedSync: () => false,
    getUseCustomToolModelSync: () => false,
    hasLatestFlashGAAccess: () => false,
    hasLatestFlashLiteGAAccess: () => false,
    getProModelNoAccessSync: () => false,
    getLastRetrievedQuota: () => ({ buckets }),
    modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
    ...overrides,
  } as unknown as Config;
  return { config, availability };
}

describe('hard quota model selection', () => {
  it.each(['auto', 'auto-gemini-2.5', 'auto-gemini-3'])(
    'keeps quota fallback enabled for the %s selection',
    (selection) => {
      const { config } = fixture(BASE_GEMINI_FLASH_MODEL, [], {
        getModel: () => selection,
      });
      markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);

      expect(
        resolveQuotaFallbackModel(config, BASE_GEMINI_FLASH_MODEL)
          ?.selectedModel,
      ).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.getModel()).toBe(selection);
    },
  );

  it.each([
    'gemini-3-pro-preview',
    BASE_GEMINI_FLASH_MODEL,
    'custom-model',
    'flash',
    'pro',
  ])(
    'keeps manually selected %s even when other models have quota',
    (model) => {
      const { config } = fixture(
        model,
        [
          { modelId: model, remainingFraction: 0 },
          { modelId: DEFAULT_GEMINI_MODEL, remainingFraction: 0.5 },
        ],
        { getModel: () => model },
      );
      markQuotaExhausted(config, model);

      expect(resolveQuotaFallbackModel(config, model)).toBeUndefined();
      expect(selectModelForAvailability(config, model).selectedModel).toBe(
        model,
      );
      expect(config.setActiveModel).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'routes Auto Flash to Pro with dynamic configuration=%s',
    (dynamic) => {
      const { config } = fixture(BASE_GEMINI_FLASH_MODEL, [], {
        getExperimentalDynamicModelConfiguration: () => dynamic,
      });
      markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);

      expect(
        resolveQuotaFallbackModel(config, BASE_GEMINI_FLASH_MODEL)
          ?.selectedModel,
      ).toBe(DEFAULT_GEMINI_MODEL);
      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL_AUTO);
    },
  );

  it('routes Auto Pro to Flash after its quota is exhausted', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL);
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBe(BASE_GEMINI_FLASH_MODEL);
  });

  it.each([false, true])(
    'keeps stable Auto within its policy despite preview access, dynamic=%s',
    (dynamic) => {
      for (const [requested, expected] of [
        [DEFAULT_GEMINI_MODEL, BASE_GEMINI_FLASH_MODEL],
        [BASE_GEMINI_FLASH_MODEL, DEFAULT_GEMINI_MODEL],
      ]) {
        const { config } = fixture(requested, [], {
          getExperimentalDynamicModelConfiguration: () => dynamic,
          getHasAccessToPreviewModel: () => true,
          getGemini31LaunchedSync: () => true,
        });
        markQuotaExhausted(config, requested);

        expect(
          resolveQuotaFallbackModel(config, requested)?.selectedModel,
        ).toBe(expected);
        markQuotaExhausted(config, expected);
        expect(
          resolveQuotaFallbackModel(config, requested)?.selectedModel,
        ).toBeNull();
      }
    },
  );

  it('does not introduce models excluded by a custom Auto chain', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL, [], {
      getModel: () => 'auto',
      getExperimentalDynamicModelConfiguration: () => true,
      modelConfigService: new ModelConfigService({
        ...DEFAULT_MODEL_CONFIGS,
        modelChains: {
          ...DEFAULT_MODEL_CONFIGS.modelChains,
          auto: [createDefaultPolicy(DEFAULT_GEMINI_MODEL)],
        },
      }),
    });
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBeNull();
  });

  it('uses the order and models of a custom Auto chain', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL, [], {
      getModel: () => 'auto',
      getHasAccessToPreviewModel: () => true,
      getExperimentalDynamicModelConfiguration: () => true,
      modelConfigService: new ModelConfigService({
        ...DEFAULT_MODEL_CONFIGS,
        modelChains: {
          ...DEFAULT_MODEL_CONFIGS.modelChains,
          auto: [
            createDefaultPolicy(DEFAULT_GEMINI_MODEL),
            createDefaultPolicy(BASE_GEMINI_FLASH_MODEL),
            createDefaultPolicy(PREVIEW_GEMINI_FLASH_MODEL),
          ],
        },
      }),
    });
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBe(BASE_GEMINI_FLASH_MODEL);
    markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);
    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBe(PREVIEW_GEMINI_FLASH_MODEL);
    markQuotaExhausted(config, PREVIEW_GEMINI_FLASH_MODEL);
    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBeNull();
  });

  it('does not discover unsupported models from advertised quota buckets', () => {
    const { config } = fixture(BASE_GEMINI_FLASH_MODEL, [
      { modelId: 'custom-model', remainingFraction: 0.5 },
      { modelId: 'gemini-future-pro', remainingAmount: '10' },
    ]);
    markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, BASE_GEMINI_FLASH_MODEL)?.selectedModel,
    ).toBeNull();
  });

  it('skips advertised zero quota, including the legacy Code Assist Flash bucket', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL, [
      { modelId: LEGACY_CCPA_FLASH_MODEL, remainingAmount: '0' },
    ]);
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBeNull();
  });

  it('skips an initially selected zero-quota model without waiting for a request failure', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL, [
      { modelId: DEFAULT_GEMINI_MODEL, remainingFraction: 0 },
    ]);

    expect(
      applyModelSelection(config, {
        model: DEFAULT_GEMINI_MODEL,
        isChatModel: true,
      }).model,
    ).toBe(BASE_GEMINI_FLASH_MODEL);
    expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL_AUTO);
  });

  it('does not enable quota routing for a capacity failure because an unrelated bucket is empty', () => {
    const { config, availability } = fixture(
      DEFAULT_GEMINI_MODEL,
      [{ modelId: BASE_GEMINI_FLASH_MODEL, remainingFraction: 0 }],
      { getModel: () => DEFAULT_GEMINI_MODEL },
    );
    availability.markTerminal(DEFAULT_GEMINI_MODEL, 'capacity');

    expect(
      selectModelForAvailability(config, DEFAULT_GEMINI_MODEL).selectedModel,
    ).toBe(DEFAULT_GEMINI_MODEL);
  });

  it.each(['auto', 'flash'])(
    'resolves the %s alias before checking failed quota health',
    (alias) => {
      const { config } = fixture(alias);
      markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);
      markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);

      expect(
        selectModelForAvailability(config, alias).selectedModel,
      ).toBeNull();
    },
  );

  it('keeps the configured Auto chain when a request uses a backend Flash alias', () => {
    const { config } = fixture(LEGACY_CCPA_FLASH_MODEL);
    markQuotaExhausted(config, LEGACY_CCPA_FLASH_MODEL);

    expect(
      resolveQuotaFallbackModel(config, LEGACY_CCPA_FLASH_MODEL)?.selectedModel,
    ).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('does not retry the same Code Assist Flash backend under another ID', () => {
    const { config, availability } = fixture(LEGACY_CCPA_FLASH_MODEL);
    markQuotaExhausted(config, LEGACY_CCPA_FLASH_MODEL);
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(availability.snapshot(BASE_GEMINI_FLASH_MODEL)).toEqual({
      available: false,
      reason: 'quota',
    });
    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBeNull();
    availability.resetTurn();
    expect(availability.snapshot(LEGACY_CCPA_FLASH_MODEL).available).toBe(
      false,
    );
  });

  it('keeps distinct API-key backend IDs separate', () => {
    const { config, availability } = fixture(BASE_GEMINI_FLASH_MODEL, [], {
      getContentGeneratorConfig: () => ({ authType: AuthType.USE_GEMINI }),
    });
    markQuotaExhausted(config, BASE_GEMINI_FLASH_MODEL);

    expect(availability.snapshot(LEGACY_CCPA_FLASH_MODEL).available).toBe(true);
  });

  it('skips a nominal fallback whose runtime override resolves back to an exhausted model', () => {
    const { config } = fixture(DEFAULT_GEMINI_MODEL);
    config.modelConfigService.registerRuntimeModelOverride({
      match: { model: BASE_GEMINI_FLASH_MODEL },
      modelConfig: { model: DEFAULT_GEMINI_MODEL },
    });
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);

    expect(
      resolveQuotaFallbackModel(config, DEFAULT_GEMINI_MODEL)?.selectedModel,
    ).toBeNull();
  });

  it('terminates when Pro is disallowed and the only Flash model is unavailable', () => {
    const { config, availability } = fixture(DEFAULT_GEMINI_MODEL, [], {
      getProModelNoAccessSync: () => true,
    });
    markQuotaExhausted(config, DEFAULT_GEMINI_MODEL);
    availability.markTerminal(BASE_GEMINI_FLASH_MODEL, 'capacity');

    expect(() =>
      applyModelSelection(config, { model: DEFAULT_GEMINI_MODEL }),
    ).toThrow('No model with available quota');
  });

  it('respects preview and Gemini 3.1 access flags when selecting the other tier', () => {
    const { config } = fixture(PREVIEW_GEMINI_FLASH_MODEL, [], {
      getModel: () => 'auto-gemini-3',
      getHasAccessToPreviewModel: () => true,
      getGemini31LaunchedSync: () => true,
    });
    markQuotaExhausted(config, PREVIEW_GEMINI_FLASH_MODEL);

    expect(
      resolveQuotaFallbackModel(config, PREVIEW_GEMINI_FLASH_MODEL)
        ?.selectedModel,
    ).toBe(PREVIEW_GEMINI_3_1_MODEL);
    markQuotaExhausted(config, PREVIEW_GEMINI_3_1_MODEL);
    expect(
      resolveQuotaFallbackModel(config, PREVIEW_GEMINI_3_1_MODEL)
        ?.selectedModel,
    ).toBeNull();
  });

  it.each(['custom-model', 'gemini-future-pro', 'gemma-4-31b-it'])(
    'preserves explicit selection of %s',
    (model) => {
      const { config } = fixture(model, [], { getModel: () => model });
      markQuotaExhausted(config, model);

      expect(resolveQuotaFallbackModel(config, model)).toBeUndefined();
      expect(selectModelForAvailability(config, model).selectedModel).toBe(
        model,
      );
    },
  );
});
