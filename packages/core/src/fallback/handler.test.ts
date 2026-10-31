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
  type Mock,
  type MockInstance,
  afterEach,
} from 'vitest';
import { handleFallback } from './handler.js';
import type { Config } from '../config/config.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import { createAvailabilityServiceMock } from '../availability/testUtils.js';
import { AuthType } from '../core/contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import type { FallbackModelHandler } from './types.js';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';
import { debugLogger } from '../utils/debugLogger.js';
import * as policyHelpers from '../availability/policyHelpers.js';
import { createDefaultPolicy } from '../availability/policyCatalog.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from '../config/defaultModelConfigs.js';
import {
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';

// Mock the telemetry logger and event class
vi.mock('../telemetry/index.js', () => ({
  logFlashFallback: vi.fn(),
  FlashFallbackEvent: class {},
}));
vi.mock('../utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: vi.fn(),
  shouldLaunchBrowser: vi.fn().mockReturnValue(true),
}));

// Mock debugLogger to prevent console pollution and allow spying
vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  },
}));

const MOCK_PRO_MODEL = DEFAULT_GEMINI_MODEL;
const FALLBACK_MODEL = DEFAULT_GEMINI_FLASH_MODEL;
const AUTH_OAUTH = AuthType.LOGIN_WITH_GOOGLE;

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    fallbackHandler: undefined,
    getFallbackModelHandler: vi.fn(),
    setActiveModel: vi.fn(),
    setModel: vi.fn(),
    activateFallbackMode: vi.fn(),
    rotateSessionId: vi.fn(),
    modelConfigService: new ModelConfigService(DEFAULT_MODEL_CONFIGS),
    getModelAvailabilityService: vi.fn(() =>
      createAvailabilityServiceMock({
        selectedModel: FALLBACK_MODEL,
        skipped: [],
      }),
    ),
    getActiveModel: vi.fn(() => MOCK_PRO_MODEL),
    getModel: vi.fn(() => DEFAULT_GEMINI_MODEL_AUTO),
    getUserTier: vi.fn(() => undefined),
    isInteractive: vi.fn(() => false),
    getHasAccessToPreviewModel: vi.fn(() => false),
    ...overrides,
  }) as unknown as Config;

describe('handleFallback', () => {
  let mockConfig: Config;
  let mockHandler: Mock<FallbackModelHandler>;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandler = vi.fn();
    // Default setup: OAuth user, Pro model failed, handler injected
    mockConfig = createMockConfig({
      fallbackModelHandler: mockHandler,
    });
    // Explicitly set the property to ensure it's present for legacy checks
    mockConfig.fallbackModelHandler = mockHandler;

    // We mocked debugLogger, so we don't need to spy on console.error for handler failures
    // But tests might check console.error usage in legacy code if any?
    // The handler uses console.error in legacyHandleFallback.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('policy-driven flow', () => {
    let policyConfig: Config;
    let availability: ModelAvailabilityService;
    let policyHandler: Mock<FallbackModelHandler>;

    beforeEach(() => {
      vi.clearAllMocks();
      availability = createAvailabilityServiceMock({
        selectedModel: DEFAULT_GEMINI_FLASH_MODEL,
        skipped: [],
      });
      policyHandler = vi.fn().mockResolvedValue('retry_once');
      policyConfig = createMockConfig();

      // Ensure we test the availability path
      vi.mocked(policyConfig.getModelAvailabilityService).mockReturnValue(
        availability,
      );
      vi.mocked(policyConfig.getFallbackModelHandler).mockReturnValue(
        policyHandler,
      );
    });

    it.each([
      MOCK_PRO_MODEL,
      'gemini-3-pro-preview',
      DEFAULT_GEMINI_FLASH_MODEL,
    ])('only offers same-model retries for manual %s', async (model) => {
      vi.mocked(policyConfig.getModel).mockReturnValue(model);
      policyHandler.mockResolvedValue('retry_always');
      const result = await handleFallback(
        policyConfig,
        model,
        AUTH_OAUTH,
        new TerminalQuotaError(
          'Quota exhausted',
          { code: 429, message: 'Quota exhausted', details: [] },
          3600,
        ),
      );
      expect(result).toBe(true);
      expect(policyHandler).toHaveBeenCalledWith(
        model,
        model,
        expect.any(TerminalQuotaError),
      );
      expect(availability.selectFirstAvailable).not.toHaveBeenCalled();
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      expect(policyConfig.setActiveModel).not.toHaveBeenCalled();
    });

    it('preserves explicit credit retry for manual selection without activating a fallback', async () => {
      vi.mocked(policyConfig.getModel).mockReturnValue(MOCK_PRO_MODEL);
      policyHandler.mockResolvedValue('retry_with_credits');
      const error = new TerminalQuotaError(
        'Quota exhausted',
        { code: 429, message: 'Quota exhausted', details: [] },
        3600,
      );

      expect(
        await handleFallback(policyConfig, MOCK_PRO_MODEL, AUTH_OAUTH, error),
      ).toBe(true);
      expect(policyHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        MOCK_PRO_MODEL,
        error,
      );
      expect(policyConfig.setModel).not.toHaveBeenCalled();
      expect(policyConfig.setActiveModel).not.toHaveBeenCalled();
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      expect(availability.selectFirstAvailable).not.toHaveBeenCalled();
    });

    it('uses availability selection with correct candidates when enabled', async () => {
      // Direct mock manipulation since it's already a vi.fn()
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      await handleFallback(policyConfig, DEFAULT_GEMINI_MODEL, AUTH_OAUTH);

      expect(availability.selectFirstAvailable).toHaveBeenCalledWith([
        DEFAULT_GEMINI_FLASH_MODEL,
      ]);
    });

    it('falls back to last resort when availability returns null', async () => {
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );
      availability.selectFirstAvailable = vi
        .fn()
        .mockReturnValue({ selectedModel: null, skipped: [] });
      policyHandler.mockResolvedValue('retry_once');

      await handleFallback(policyConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

      expect(policyHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        undefined,
      );
    });

    it('executes silent policy action without invoking UI handler', async () => {
      const proPolicy = createDefaultPolicy(MOCK_PRO_MODEL);
      const flashPolicy = createDefaultPolicy(DEFAULT_GEMINI_FLASH_MODEL);
      flashPolicy.actions = {
        ...flashPolicy.actions,
        terminal: 'silent',
        unknown: 'silent',
      };
      flashPolicy.isLastResort = true;

      const silentChain = [proPolicy, flashPolicy];
      const chainSpy = vi
        .spyOn(policyHelpers, 'resolvePolicyChain')
        .mockReturnValue(silentChain);

      try {
        availability.selectFirstAvailable = vi.fn().mockReturnValue({
          selectedModel: DEFAULT_GEMINI_FLASH_MODEL,
          skipped: [],
        });

        const result = await handleFallback(
          policyConfig,
          MOCK_PRO_MODEL,
          AUTH_OAUTH,
        );

        expect(result).toBe(true);
        expect(policyConfig.getFallbackModelHandler).not.toHaveBeenCalled();
        expect(policyConfig.activateFallbackMode).toHaveBeenCalledWith(
          DEFAULT_GEMINI_FLASH_MODEL,
          undefined,
        );
      } finally {
        chainSpy.mockRestore();
      }
    });

    it('does not wrap around to upgrade candidates if the current model was selected at the end (e.g. by router)', async () => {
      // Last-resort failure (Flash) in [Preview, Pro, Flash] checks Preview then Pro (all upstream).
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      availability.selectFirstAvailable = vi.fn().mockReturnValue({
        selectedModel: MOCK_PRO_MODEL,
        skipped: [],
      });
      // Mock activeModel to be unavailable so the utility bypass heuristic is skipped
      vi.mocked(availability.snapshot).mockReturnValue({ available: false });

      policyHandler.mockResolvedValue('retry_once');

      await handleFallback(
        policyConfig,
        DEFAULT_GEMINI_FLASH_MODEL,
        AUTH_OAUTH,
      );

      expect(availability.selectFirstAvailable).not.toHaveBeenCalled();
      expect(policyHandler).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        undefined,
      );
    });

    it('successfully follows expected availability response for Preview Chain', async () => {
      availability.selectFirstAvailable = vi.fn().mockReturnValue({
        selectedModel: PREVIEW_GEMINI_FLASH_MODEL,
        skipped: [],
      });
      policyHandler.mockResolvedValue('retry_once');
      vi.mocked(policyConfig.getActiveModel).mockReturnValue(
        PREVIEW_GEMINI_MODEL,
      );
      vi.mocked(policyConfig.getModel).mockReturnValue(
        PREVIEW_GEMINI_MODEL_AUTO,
      );
      vi.mocked(policyConfig.getHasAccessToPreviewModel).mockReturnValue(true);

      const result = await handleFallback(
        policyConfig,
        PREVIEW_GEMINI_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(availability.selectFirstAvailable).toHaveBeenCalledWith([
        PREVIEW_GEMINI_FLASH_MODEL,
      ]);
    });

    it('should launch upgrade flow and avoid fallback mode when handler returns "upgrade"', async () => {
      policyHandler.mockResolvedValue('upgrade');
      vi.mocked(openBrowserSecurely).mockResolvedValue(undefined);

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(false);
      expect(openBrowserSecurely).toHaveBeenCalledWith(
        'https://goo.gle/set-up-gemini-code-assist',
      );
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
    });

    it.each([
      new TerminalQuotaError(
        'Capacity exceeded',
        { code: 429, message: 'Capacity exceeded', details: [] },
        undefined,
        'MODEL_CAPACITY_EXHAUSTED',
      ),
      new TerminalQuotaError(
        'Service unavailable',
        { code: 503, message: 'Service unavailable', details: [] },
        600,
      ),
    ])(
      'does not preserve capacity or server failures as exhausted quota during ordinary fallback',
      async (error) => {
        vi.mocked(policyConfig.getModel).mockReturnValue(
          DEFAULT_GEMINI_MODEL_AUTO,
        );
        policyHandler.mockResolvedValue('retry_always');

        await handleFallback(policyConfig, MOCK_PRO_MODEL, AUTH_OAUTH, error);

        if (error.reason === 'MODEL_CAPACITY_EXHAUSTED') {
          expect(availability.markRetryOncePerTurn).toHaveBeenCalledWith(
            MOCK_PRO_MODEL,
            3,
          );
          expect(availability.consumeStickyAttempt).toHaveBeenCalledWith(
            MOCK_PRO_MODEL,
          );
          expect(availability.markTerminal).not.toHaveBeenCalled();
        } else {
          expect(availability.markTerminal).toHaveBeenCalledWith(
            MOCK_PRO_MODEL,
            'capacity',
          );
        }
        expect(availability.markTerminal).not.toHaveBeenCalledWith(
          MOCK_PRO_MODEL,
          'quota',
        );
        expect(policyHandler).toHaveBeenCalled();
      },
    );

    it('should catch errors from the handler, log an error, and return null', async () => {
      const handlerError = new Error('UI interaction failed');
      policyHandler.mockRejectedValue(handlerError);

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBeNull();
      expect(debugLogger.error).toHaveBeenCalledWith(
        'Fallback handler failed:',
        handlerError,
      );
    });

    it('switches immediately on TerminalQuotaError without asking the UI handler', async () => {
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const terminalError = new TerminalQuotaError(
        'Quota error',
        mockGoogleApiError,
        5,
      );
      policyHandler.mockResolvedValue('retry_always');
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
        terminalError,
      );

      expect(result).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(policyHandler).not.toHaveBeenCalled();
      expect(policyConfig.setActiveModel).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      expect(debugLogger.log).toHaveBeenCalledWith(
        `Usage limit reached on ${MOCK_PRO_MODEL}. Switching to ${DEFAULT_GEMINI_FLASH_MODEL}.`,
      );
    });

    it('should pass RetryableQuotaError correctly to the handler', async () => {
      const mockGoogleApiError = {
        code: 503,
        message: 'mock error',
        details: [],
      };
      const retryableError = new RetryableQuotaError(
        'Service unavailable',
        mockGoogleApiError,
        1000,
      );
      policyHandler.mockResolvedValue('retry_once');
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
        retryableError,
      );

      expect(policyHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        retryableError,
      );
    });

    it('Call the handler with fallback model same as the failed model when the failed model is the last-resort policy', async () => {
      // Ensure short-circuit when wrapping to an unavailable upstream model.
      availability.selectFirstAvailable = vi
        .fn()
        .mockReturnValue({ selectedModel: null, skipped: [] });
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );
      // Mock activeModel to be unavailable so the utility bypass heuristic is skipped
      vi.mocked(availability.snapshot).mockReturnValue({ available: false });

      const result = await handleFallback(
        policyConfig,
        DEFAULT_GEMINI_FLASH_MODEL,
        AUTH_OAUTH,
      );

      policyHandler.mockResolvedValue('retry_once');

      expect(result).not.toBeNull();
      expect(policyHandler).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        undefined,
      );
    });

    it('calls activateFallbackMode when handler returns "retry_always"', async () => {
      policyHandler.mockResolvedValue('retry_always');
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(policyConfig.activateFallbackMode).toHaveBeenCalledWith(
        FALLBACK_MODEL,
        undefined,
      );
      // TODO: add logging expect statement
    });

    it('does NOT call activateFallbackMode when handler returns "stop"', async () => {
      policyHandler.mockResolvedValue('stop');

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(false);
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      // TODO: add logging expect statement
    });

    it('does NOT call activateFallbackMode or markTerminal when handler returns "retry_once"', async () => {
      policyHandler.mockResolvedValue('retry_once');
      vi.mocked(policyConfig.getHasAccessToPreviewModel).mockReturnValue(true);
      vi.mocked(policyConfig.getModel).mockReturnValue(
        'gemini-3.1-pro-preview-customtools',
      );
      vi.mocked(policyConfig.getActiveModel).mockReturnValue(
        'gemini-3.1-pro-preview-customtools',
      );
      policyConfig.getGemini31LaunchedSync = vi.fn(() => true);
      policyConfig.getUseCustomToolModelSync = vi.fn(() => true);
      vi.mocked(availability.selectFirstAvailable).mockReturnValue({
        selectedModel: PREVIEW_GEMINI_FLASH_MODEL,
        skipped: [],
      });

      const capacityError = new TerminalQuotaError(
        'No capacity available',
        { code: 429, message: 'No capacity available', details: [] },
        5,
        'MODEL_CAPACITY_EXHAUSTED',
      );

      const result = await handleFallback(
        policyConfig,
        'gemini-3.1-pro-preview-customtools',
        AuthType.USE_GEMINI,
        capacityError,
      );

      expect(result).toBe(true);
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      expect(availability.markTerminal).not.toHaveBeenCalled();
      expect(availability.markRetryOncePerTurn).toHaveBeenCalledWith(
        'gemini-3.1-pro-preview-customtools',
        undefined,
      );
      expect(availability.consumeStickyAttempt).toHaveBeenCalledWith(
        'gemini-3.1-pro-preview-customtools',
      );
    });

    it('marks capacity TerminalQuotaError with reason "capacity" when handler returns "retry_always" on manual model', async () => {
      policyHandler.mockResolvedValue('retry_always');
      vi.mocked(policyConfig.getHasAccessToPreviewModel).mockReturnValue(true);
      vi.mocked(policyConfig.getModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
      vi.mocked(policyConfig.getActiveModel).mockReturnValue(
        PREVIEW_GEMINI_MODEL,
      );
      vi.mocked(availability.selectFirstAvailable).mockReturnValue({
        selectedModel: PREVIEW_GEMINI_FLASH_MODEL,
        skipped: [],
      });

      const capacityError = new TerminalQuotaError(
        'No capacity available',
        { code: 429, message: 'No capacity available', details: [] },
        5,
        'MODEL_CAPACITY_EXHAUSTED',
      );

      const result = await handleFallback(
        policyConfig,
        PREVIEW_GEMINI_MODEL,
        AUTH_OAUTH,
        capacityError,
      );

      expect(result).toBe(true);
      expect(availability.markTerminal).toHaveBeenCalledWith(
        PREVIEW_GEMINI_MODEL,
        'capacity',
      );
      expect(policyConfig.activateFallbackMode).toHaveBeenCalledWith(
        PREVIEW_GEMINI_FLASH_MODEL,
        undefined,
      );
    });
  });
});
