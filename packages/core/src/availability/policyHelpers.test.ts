/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolvePolicyChain,
  buildFallbackPolicyContext,
  applyModelSelection,
  applyAvailabilityTransition,
} from './policyHelpers.js';
import { createDefaultPolicy, SILENT_ACTIONS } from './policyCatalog.js';
import type { RetryAvailabilityContext } from './modelPolicy.js';
import type { Config } from '../config/config.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
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
    getGemini31FlashLiteLaunchedSync: () => false,
    getUseCustomToolModelSync: () => {
      const useGemini31 = config.getGemini31LaunchedSync();
      const authType = config.getContentGeneratorConfig().authType;
      return useGemini31 && authType === AuthType.USE_GEMINI;
    },
    getContentGeneratorConfig: () => ({ authType: undefined }),
    getMaxAttemptsPerTurn: () => 3,
    ...overrides,
  } as unknown as Config;
  return config;
};

describe('policyHelpers', () => {
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
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
    });

    it('uses auto chain when preferred model is auto', () => {
      const config = createMockConfig({
        getModel: () => 'gemini-2.5-pro',
      });
      const chain = resolvePolicyChain(config, DEFAULT_GEMINI_MODEL_AUTO);
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
    });

    it('uses auto chain when configured model is auto even if preferred is concrete', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, 'gemini-2.5-pro');
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
    });

    it('wraps chain when preferredModel is concrete and configured is auto', () => {
      // When Auto mode routes to a concrete model (e.g. router picks Flash),
      // the chain must wrap so the failed model has a fallback candidate.
      // Without wrap, chain collapses to [Flash] and quota exhaustion has no
      // fallback target.
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, 'gemini-2.5-flash');
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-flash');
      expect(chain[1]?.model).toBe('gemini-2.5-pro');
    });

    it('returns flash-lite chain when preferred model is flash-lite', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, DEFAULT_GEMINI_FLASH_LITE_MODEL);
      expect(chain).toHaveLength(3);
      expect(chain[0]?.model).toBe('gemini-2.5-flash-lite');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
      expect(chain[2]?.model).toBe('gemini-2.5-pro');
    });

    it('returns flash-lite chain when configured model is flash-lite', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_FLASH_LITE_MODEL,
      });
      const chain = resolvePolicyChain(config);
      expect(chain).toHaveLength(3);
      expect(chain[0]?.model).toBe('gemini-2.5-flash-lite');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
      expect(chain[2]?.model).toBe('gemini-2.5-pro');
    });

    it('wraps around the chain when wrapsAround is true', () => {
      const config = createMockConfig({
        getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      });
      const chain = resolvePolicyChain(config, 'gemini-2.5-flash', {
        wrapsAround: true,
      });
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-flash');
      expect(chain[1]?.model).toBe('gemini-2.5-pro');
    });

    it('proactively returns Gemini 2.5 chain if Gemini 3 requested but user lacks access', () => {
      const config = createMockConfig({
        getModel: () => 'auto-gemini-3',
        getHasAccessToPreviewModel: () => false,
      });
      const chain = resolvePolicyChain(config);

      // Should downgrade to [Pro 2.5, Flash 2.5]
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe('gemini-2.5-pro');
      expect(chain[1]?.model).toBe('gemini-2.5-flash');
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
      {
        name: 'Flash3 Utility Chain',
        model: 'gemini-3-flash-preview',
        isUtility: true,
      },
      {
        name: 'Flash25 Utility Chain',
        model: 'gemini-2.5-flash',
        isUtility: true,
      },
      {
        name: 'Flash Lite Utility Chain',
        model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        isUtility: true,
      },
    ];

    testCases.forEach(
      ({
        name,
        model,
        useGemini31,
        hasAccess,
        authType,
        wrapsAround,
        isUtility,
      }) => {
        it(`achieves parity for: ${name}`, () => {
          const createBaseConfig = (dynamic: boolean) =>
            createMockConfig({
              getExperimentalDynamicModelConfiguration: () => dynamic,
              getModel: () => model,
              getGemini31LaunchedSync: () => useGemini31 ?? false,
              getGemini31FlashLiteLaunchedSync: () => false,
              getHasAccessToPreviewModel: () => hasAccess ?? true,
              getContentGeneratorConfig: () => ({ authType }),
              modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
            });

          const opts = { wrapsAround, isUtility };
          const legacyChain = resolvePolicyChain(
            createBaseConfig(false),
            model,
            opts,
          );
          const dynamicChain = resolvePolicyChain(
            createBaseConfig(true),
            model,
            opts,
          );

          expect(dynamicChain).toEqual(legacyChain);
        });
      },
    );
  });

  describe('utility chain (isUtility=true)', () => {
    const FLASH3 = 'gemini-3-flash-preview';
    const FLASH25 = 'gemini-2.5-flash';
    const FLASH_LITE = DEFAULT_GEMINI_FLASH_LITE_MODEL;

    it('returns [Flash3, Flash25, FlashLite] for a Flash3 utility model', () => {
      const config = createMockConfig({ getModel: () => FLASH3 });
      const chain = resolvePolicyChain(config, FLASH3, { isUtility: true });
      expect(chain).toHaveLength(3);
      expect(chain[0]?.model).toBe(FLASH3);
      expect(chain[1]?.model).toBe(FLASH25);
      expect(chain[2]?.model).toBe(FLASH_LITE);
      expect(chain[2]?.isLastResort).toBe(true);
    });

    it('returns [Flash25, FlashLite] for a Flash25 utility model', () => {
      const config = createMockConfig({ getModel: () => FLASH25 });
      const chain = resolvePolicyChain(config, FLASH25, { isUtility: true });
      expect(chain).toHaveLength(2);
      expect(chain[0]?.model).toBe(FLASH25);
      expect(chain[1]?.model).toBe(FLASH_LITE);
      expect(chain[1]?.isLastResort).toBe(true);
    });

    it('uses silent actions throughout the utility chain', () => {
      const config = createMockConfig({ getModel: () => FLASH3 });
      const chain = resolvePolicyChain(config, FLASH3, { isUtility: true });
      for (const policy of chain) {
        expect(policy.actions).toEqual(SILENT_ACTIONS);
      }
    });

    it('uses sticky_retry for transient errors on non-last-resort utility entries', () => {
      const config = createMockConfig({ getModel: () => FLASH3 });
      const chain = resolvePolicyChain(config, FLASH3, { isUtility: true });
      // Flash3 and Flash2.5 should use sticky_retry so a network blip does not
      // permanently mark them terminal for the session.
      expect(chain[0]?.stateTransitions?.transient).toBe('sticky_retry');
      expect(chain[1]?.stateTransitions?.transient).toBe('sticky_retry');
      // FlashLite (lastResort) uses terminal — nothing left to fall back to.
      expect(chain[2]?.stateTransitions?.transient).toBe('terminal');
    });

    it('selects Flash25 when Flash3 is unavailable', () => {
      const config = createMockConfig({
        getModel: () => FLASH3,
        getModelAvailabilityService: () =>
          ({
            snapshot: (m: string) =>
              m === FLASH3 ? { available: false } : undefined,
          }) as unknown as ReturnType<Config['getModelAvailabilityService']>,
      });
      const chain = resolvePolicyChain(config, FLASH3, { isUtility: true });
      // Flash3 is unavailable; utility chain still contains all 3 elements
      // so that selectFirstAvailable can pick Flash25 next.
      expect(chain[0]?.model).toBe(FLASH3);
      expect(chain[1]?.model).toBe(FLASH25);
    });

    it('falls back to FlashLite chain when utility model is FlashLite itself', () => {
      const config = createMockConfig({ getModel: () => FLASH_LITE });
      const chain = resolvePolicyChain(config, FLASH_LITE, { isUtility: true });
      expect(chain[0]?.model).toBe(FLASH_LITE);
      expect(chain.length).toBeGreaterThanOrEqual(2);
    });

    it('returns single-model chain for non-Flash utility models (no fallback defined)', () => {
      // Pro-as-utility has no dedicated fallback chain. If Pro hits quota as a
      // utility caller, it fails silently with no downgrade path. This is a
      // known limitation — utility chains only cover Flash-tier models.
      const config = createMockConfig({
        getModel: () => 'gemini-3-pro-preview',
      });
      const chain = resolvePolicyChain(config, 'gemini-3-pro-preview', {
        isUtility: true,
      });
      expect(chain).toHaveLength(1);
      expect(chain[0]?.model).toBe('gemini-3-pro-preview');
    });
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

  describe('applyModelSelection — utility derivation from isChatModel', () => {
    it('routes Flash3 through utility chain when isChatModel is not set', () => {
      const FLASH3 = 'gemini-3-flash-preview';
      const FLASH25 = 'gemini-2.5-flash';
      const availabilityService = {
        selectFirstAvailable: (models: string[]) => ({
          selectedModel: models.find((m) => m !== FLASH3) ?? models[0],
          skipped: [FLASH3],
        }),
        consumeStickyAttempt: vi.fn(),
      };
      const config = createMockConfig({
        getModelAvailabilityService: () =>
          availabilityService as unknown as ReturnType<
            Config['getModelAvailabilityService']
          >,
        setActiveModel: vi.fn(),
        modelConfigService: {
          getResolvedConfig: (key: { model: string }) => ({
            model: key.model,
            generateContentConfig: {},
          }),
        } as unknown as ModelConfigService,
      });

      // No isChatModel set → treated as utility → selectFirstAvailable sees
      // [Flash3, Flash25, FlashLite] and skips Flash3 → selects Flash25.
      const result = applyModelSelection(config, { model: FLASH3 });
      expect(result.model).toBe(FLASH25);
      // setActiveModel must NOT be called for utility callers.
      expect(config.setActiveModel).not.toHaveBeenCalled();
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
