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
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import { logFlashFallback } from '../telemetry/index.js';
import type { FallbackModelHandler } from './types.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';
import * as policyHelpers from '../availability/policyHelpers.js';
import { createDefaultPolicy } from '../availability/policyCatalog.js';
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
const AUTH_API_KEY = AuthType.USE_GEMINI;

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    isInFallbackMode: vi.fn(() => false),
    setFallbackMode: vi.fn(),
    isModelAvailabilityServiceEnabled: vi.fn(() => false),
    isPreviewModelFallbackMode: vi.fn(() => false),
    setPreviewModelFallbackMode: vi.fn(),
    isPreviewModelBypassMode: vi.fn(() => false),
    setPreviewModelBypassMode: vi.fn(),
    fallbackHandler: undefined,
    getFallbackModelHandler: vi.fn(),
    setActiveModel: vi.fn(),
    getModelAvailabilityService: vi.fn(() =>
      createAvailabilityServiceMock({
        selectedModel: FALLBACK_MODEL,
        skipped: [],
      }),
    ),
    getModel: vi.fn(() => MOCK_PRO_MODEL),
    getPreviewFeatures: vi.fn(() => false),
    getUserTier: vi.fn(() => undefined),
    isInteractive: vi.fn(() => false),
    ...overrides,
  }) as unknown as Config;

describe('handleFallback', () => {
  let mockConfig: Config;
  let mockHandler: Mock<FallbackModelHandler>;
  let consoleErrorSpy: MockInstance;
  let fallbackEventSpy: MockInstance;

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
    fallbackEventSpy = vi.spyOn(coreEvents, 'emitFallbackModeChanged');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    fallbackEventSpy.mockRestore();
  });

  it('should return null immediately if authType is not OAuth', async () => {
    const result = await handleFallback(
      mockConfig,
      MOCK_PRO_MODEL,
      AUTH_API_KEY,
    );
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
  });

  it('should still consult the handler if the failed model is the fallback model', async () => {
    mockHandler.mockResolvedValue('stop');
    const result = await handleFallback(
      mockConfig,
      FALLBACK_MODEL, // Failed model is Flash
      AUTH_OAUTH,
    );
    expect(result).toBe(false);
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should return null if no fallbackHandler is injected in config', async () => {
    const configWithoutHandler = createMockConfig({
      fallbackModelHandler: undefined,
    });
    const result = await handleFallback(
      configWithoutHandler,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
    );
    expect(result).toBeNull();
  });

  describe('when handler returns "retry_always"', () => {
    it('should activate fallback mode, log telemetry, and return true', async () => {
      mockHandler.mockResolvedValue('retry_always');

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(mockConfig.setFallbackMode).toHaveBeenCalledWith(true);
      expect(logFlashFallback).toHaveBeenCalled();
    });
  });

  describe('when handler returns "stop"', () => {
    it('should activate fallback mode, log telemetry, and return false', async () => {
      mockHandler.mockResolvedValue('stop');

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(false);
      expect(mockConfig.setFallbackMode).toHaveBeenCalledWith(true);
      expect(logFlashFallback).toHaveBeenCalled();
    });
  });

  it('should return false without toggling fallback when handler returns "retry_later"', async () => {
    mockHandler.mockResolvedValue('retry_later');

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toBe(false);
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    expect(logFlashFallback).not.toHaveBeenCalled();
    expect(fallbackEventSpy).not.toHaveBeenCalled();
  });

  it('should launch upgrade flow and avoid fallback mode when handler returns "upgrade"', async () => {
    mockHandler.mockResolvedValue('upgrade');
    vi.mocked(openBrowserSecurely).mockResolvedValue(undefined);

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toBe(false);
    expect(openBrowserSecurely).toHaveBeenCalledWith(
      'https://goo.gle/set-up-gemini-code-assist',
    );
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    expect(logFlashFallback).not.toHaveBeenCalled();
    expect(fallbackEventSpy).not.toHaveBeenCalled();
  });

  it('should log a warning and continue when upgrade flow fails to open a browser', async () => {
    mockHandler.mockResolvedValue('upgrade');
    const debugWarnSpy = vi.spyOn(debugLogger, 'warn');
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    vi.mocked(openBrowserSecurely).mockRejectedValue(new Error('blocked'));

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toBe(false);
    expect(debugWarnSpy).toHaveBeenCalledWith(
      'Failed to open browser automatically:',
      'blocked',
    );
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    expect(fallbackEventSpy).not.toHaveBeenCalled();
    debugWarnSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('when handler returns an unexpected value', () => {
    it('should log an error and return null', async () => {
      mockHandler.mockResolvedValue(null);

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Fallback UI handler failed:',
        new Error(
          'Unexpected fallback intent received from fallbackModelHandler: "null"',
        ),
      );
      expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    });
  });

  it('should pass the correct context (failedModel, fallbackModel, error) to the handler', async () => {
    const mockError = new Error('Quota Exceeded');
    mockHandler.mockResolvedValue('retry_always');

    await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH, mockError);

    expect(mockHandler).toHaveBeenCalledWith(
      MOCK_PRO_MODEL,
      FALLBACK_MODEL,
      mockError,
    );
  });

  it('should not call setFallbackMode or log telemetry if already in fallback mode', async () => {
    // Setup config where fallback mode is already active
    const activeFallbackConfig = createMockConfig({
      fallbackModelHandler: mockHandler,
      isInFallbackMode: vi.fn(() => true), // Already active
      setFallbackMode: vi.fn(),
    });

    mockHandler.mockResolvedValue('retry_always');

    const result = await handleFallback(
      activeFallbackConfig,
      MOCK_PRO_MODEL,
      AUTH_OAUTH,
    );

    // Should still return true to allow the retry (which will use the active fallback mode)
    expect(result).toBe(true);
    // Should still consult the handler
    expect(mockHandler).toHaveBeenCalled();
    // But should not mutate state or log telemetry again
    expect(activeFallbackConfig.setFallbackMode).not.toHaveBeenCalled();
    expect(logFlashFallback).not.toHaveBeenCalled();
  });

  it('should catch errors from the handler, log an error, and return null', async () => {
    const handlerError = new Error('UI interaction failed');
    mockHandler.mockRejectedValue(handlerError);

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Fallback UI handler failed:',
      handlerError,
    );
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
  });

  describe('Preview Model Fallback Logic', () => {
    const previewModel = PREVIEW_GEMINI_MODEL;

    it('should only set Preview Model bypass mode on retryable quota failure', async () => {
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const retryableQuotaError = new RetryableQuotaError(
        'Capacity error',
        mockGoogleApiError,
        5,
      );
      await handleFallback(
        mockConfig,
        previewModel,
        AUTH_OAUTH,
        retryableQuotaError,
      );
      expect(mockConfig.setPreviewModelBypassMode).toHaveBeenCalledWith(true);
    });

    it('should not set Preview Model bypass mode on non-retryable quota failure', async () => {
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const terminalQuotaError = new TerminalQuotaError(
        'quota error',
        mockGoogleApiError,
        5,
      );
      await handleFallback(
        mockConfig,
        previewModel,
        AUTH_OAUTH,
        terminalQuotaError,
      );

      expect(mockConfig.setPreviewModelBypassMode).not.toHaveBeenCalled();
    });

    it('should silently retry if Preview Model fallback mode is already active and error is retryable error', async () => {
      vi.spyOn(mockConfig, 'isPreviewModelFallbackMode').mockReturnValue(true);
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const retryableQuotaError = new RetryableQuotaError(
        'Capacity error',
        mockGoogleApiError,
        5,
      );
      const result = await handleFallback(
        mockConfig,
        previewModel,
        AUTH_OAUTH,
        retryableQuotaError,
      );

      expect(result).toBe(true);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should activate Preview Model fallback mode when handler returns "retry_always" and is RetryableQuotaError', async () => {
      mockHandler.mockResolvedValue('retry_always');
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const retryableQuotaError = new RetryableQuotaError(
        'Capacity error',
        mockGoogleApiError,
        5,
      );
      const result = await handleFallback(
        mockConfig,
        previewModel,
        AUTH_OAUTH,
        retryableQuotaError,
      );

      expect(result).toBe(true);
      expect(mockConfig.setPreviewModelBypassMode).toHaveBeenCalledWith(true);
      expect(mockConfig.setPreviewModelFallbackMode).toHaveBeenCalledWith(true);
    });

    it('should activate regular fallback when handler returns "retry_always" and is TerminalQuotaError', async () => {
      mockHandler.mockResolvedValue('retry_always');
      const mockGoogleApiError = {
        code: 503,
        message: 'mock error',
        details: [],
      };
      const terminalError = new TerminalQuotaError(
        'Quota error',
        mockGoogleApiError,
        5,
      );
      const result = await handleFallback(
        mockConfig,
        previewModel,
        AUTH_OAUTH,
        terminalError,
      );

      expect(result).toBe(true);
      expect(mockConfig.setPreviewModelFallbackMode).not.toBeCalled();
      expect(mockConfig.setFallbackMode).toHaveBeenCalledWith(true);
    });

    it('should NOT set fallback mode if user chooses "retry_once"', async () => {
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const terminalQuotaError = new TerminalQuotaError(
        'quota error',
        mockGoogleApiError,
        5,
      );
      mockHandler.mockResolvedValue('retry_once');

      const result = await handleFallback(
        mockConfig,
        PREVIEW_GEMINI_MODEL,
        AuthType.LOGIN_WITH_GOOGLE,
        terminalQuotaError,
      );

      expect(result).toBe(true);
      expect(mockConfig.setPreviewModelBypassMode).not.toHaveBeenCalled();
      expect(mockConfig.setPreviewModelFallbackMode).not.toHaveBeenCalled();
      expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    });

    it('should pass DEFAULT_GEMINI_MODEL as fallback when Preview Model fails with Retryable Error', async () => {
      const mockFallbackHandler = vi.fn().mockResolvedValue('stop');
      vi.mocked(mockConfig.fallbackModelHandler!).mockImplementation(
        mockFallbackHandler,
      );
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const retryableQuotaError = new RetryableQuotaError(
        'Capacity error',
        mockGoogleApiError,
        5,
      );

      await handleFallback(
        mockConfig,
        PREVIEW_GEMINI_MODEL,
        AuthType.LOGIN_WITH_GOOGLE,
        retryableQuotaError,
      );

      expect(mockConfig.fallbackModelHandler).toHaveBeenCalledWith(
        PREVIEW_GEMINI_MODEL,
        DEFAULT_GEMINI_MODEL,
        retryableQuotaError,
      );
    });

    it('should pass DEFAULT_GEMINI_MODEL as fallback when Preview Model fails with other error', async () => {
      await handleFallback(
        mockConfig,
        PREVIEW_GEMINI_MODEL,
        AuthType.LOGIN_WITH_GOOGLE,
      );

      expect(mockConfig.fallbackModelHandler).toHaveBeenCalledWith(
        PREVIEW_GEMINI_MODEL,
        DEFAULT_GEMINI_MODEL,
        undefined,
      );
    });

    it('should pass DEFAULT_GEMINI_FLASH_MODEL as fallback when Preview Model fails with other error', async () => {
      const mockGoogleApiError = {
        code: 429,
        message: 'mock error',
        details: [],
      };
      const terminalQuotaError = new TerminalQuotaError(
        'quota error',
        mockGoogleApiError,
        5,
      );
      await handleFallback(
        mockConfig,
        PREVIEW_GEMINI_MODEL,
        AuthType.LOGIN_WITH_GOOGLE,
        terminalQuotaError,
      );

      expect(mockConfig.fallbackModelHandler).toHaveBeenCalledWith(
        PREVIEW_GEMINI_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        terminalQuotaError,
      );
    });
  });

  it('should return null if ModelNotFoundError occurs for a non-preview model', async () => {
    const modelNotFoundError = new ModelNotFoundError('Not found');
    const result = await handleFallback(
      mockConfig,
      DEFAULT_GEMINI_MODEL, // Not preview model
      AUTH_OAUTH,
      modelNotFoundError,
    );
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should consult handler if ModelNotFoundError occurs for preview model', async () => {
    const modelNotFoundError = new ModelNotFoundError('Not found');
    mockHandler.mockResolvedValue('retry_always');

    const result = await handleFallback(
      mockConfig,
      PREVIEW_GEMINI_MODEL,
      AUTH_OAUTH,
      modelNotFoundError,
    );

    expect(result).toBe(true);
    expect(mockHandler).toHaveBeenCalled();
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
      vi.spyOn(
        policyConfig,
        'isModelAvailabilityServiceEnabled',
      ).mockReturnValue(true);
      vi.spyOn(policyConfig, 'getModelAvailabilityService').mockReturnValue(
        availability,
      );
      vi.spyOn(policyConfig, 'getFallbackModelHandler').mockReturnValue(
        policyHandler,
      );
    });

    it('uses availability selection with correct candidates when enabled', async () => {
      vi.spyOn(policyConfig, 'getPreviewFeatures').mockReturnValue(true);
      vi.spyOn(policyConfig, 'getModel').mockReturnValue(DEFAULT_GEMINI_MODEL);

      await handleFallback(policyConfig, DEFAULT_GEMINI_MODEL, AUTH_OAUTH);

      expect(availability.selectFirstAvailable).toHaveBeenCalledWith([
        DEFAULT_GEMINI_FLASH_MODEL,
        PREVIEW_GEMINI_MODEL,
      ]);
    });

    it('falls back to last resort when availability returns null', async () => {
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
        expect(policyConfig.setActiveModel).toHaveBeenCalledWith(
          DEFAULT_GEMINI_FLASH_MODEL,
        );
        // Silent actions should not trigger the legacy fallback mode (via activateFallbackMode),
        // but setActiveModel might trigger it via legacy sync if it switches to Flash.
        // However, the test requirement is "doesn't emit fallback mode".
        // Since we are mocking setActiveModel, we can verify setFallbackMode isn't called *independently*.
        // But setActiveModel is mocked, so it won't trigger side effects unless the implementation does.
        // We verified setActiveModel is called.
        // We verify setFallbackMode is NOT called (which would happen if activateFallbackMode was called).
        expect(policyConfig.setFallbackMode).not.toHaveBeenCalled();
      } finally {
        chainSpy.mockRestore();
      }
    });

    it('wraps around to upgrade candidates if the current model was selected mid-chain (e.g. by router)', async () => {
      // Last-resort failure (Flash) in [Preview, Pro, Flash] checks Preview then Pro (all upstream).
      vi.spyOn(policyConfig, 'getPreviewFeatures').mockReturnValue(true);

      availability.selectFirstAvailable = vi.fn().mockReturnValue({
        selectedModel: MOCK_PRO_MODEL,
        skipped: [],
      });
      policyHandler.mockResolvedValue('retry_once');

      await handleFallback(
        policyConfig,
        DEFAULT_GEMINI_FLASH_MODEL,
        AUTH_OAUTH,
      );

      expect(availability.selectFirstAvailable).toHaveBeenCalledWith([
        PREVIEW_GEMINI_MODEL,
        MOCK_PRO_MODEL,
      ]);
      expect(policyHandler).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
        MOCK_PRO_MODEL,
        undefined,
      );
    });

    it('logs and returns null when handler resolves to null', async () => {
      policyHandler.mockResolvedValue(null);
      const debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBeNull();
      expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
        'Fallback handler failed:',
        new Error(
          'Unexpected fallback intent received from fallbackModelHandler: "null"',
        ),
      );
      debugLoggerErrorSpy.mockRestore();
    });

    it('successfully follows expected availability response for Preview Chain', async () => {
      availability.selectFirstAvailable = vi
        .fn()
        .mockReturnValue({ selectedModel: DEFAULT_GEMINI_MODEL, skipped: [] });
      policyHandler.mockResolvedValue('retry_once');
      vi.spyOn(policyConfig, 'getPreviewFeatures').mockReturnValue(true);
      vi.spyOn(policyConfig, 'getModel').mockReturnValue(PREVIEW_GEMINI_MODEL);

      const result = await handleFallback(
        policyConfig,
        PREVIEW_GEMINI_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(availability.selectFirstAvailable).toHaveBeenCalledWith([
        DEFAULT_GEMINI_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
      ]);
      expect(policyHandler).toHaveBeenCalledWith(
        PREVIEW_GEMINI_MODEL,
        DEFAULT_GEMINI_MODEL,
        undefined,
      );
    });

    it('short-circuits when the failed model is the last-resort policy AND candidates are unavailable', async () => {
      // Ensure short-circuit when wrapping to an unavailable upstream model.
      availability.selectFirstAvailable = vi
        .fn()
        .mockReturnValue({ selectedModel: null, skipped: [] });

      const result = await handleFallback(
        policyConfig,
        DEFAULT_GEMINI_FLASH_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBeNull();
      // Service called to check upstream; no UI handler since nothing selected.
      expect(policyConfig.getModelAvailabilityService).toHaveBeenCalled();
      expect(policyConfig.getFallbackModelHandler).not.toHaveBeenCalled();
    });

    it('calls setActiveModel and logs telemetry when handler returns "retry_always"', async () => {
      policyHandler.mockResolvedValue('retry_always');

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(policyConfig.setActiveModel).toHaveBeenCalledWith(FALLBACK_MODEL);
      expect(policyConfig.setFallbackMode).not.toHaveBeenCalled();
      // TODO: add logging expect statement
    });

    it('calls setActiveModel when handler returns "stop"', async () => {
      policyHandler.mockResolvedValue('stop');

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(false);
      expect(policyConfig.setActiveModel).toHaveBeenCalledWith(FALLBACK_MODEL);
      // TODO: add logging expect statement
    });
  });
});
