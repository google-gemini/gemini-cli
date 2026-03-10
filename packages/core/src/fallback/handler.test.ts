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
  afterEach,
  type Mock,
  type MockInstance,
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
const AUTH_API_KEY = AuthType.USE_GEMINI;

type MockAvailabilityWithQuotaStatus = ModelAvailabilityService & {
  getQuotaStatus?: (model: string) =>
    | {
        remainingAmount?: number;
        remaining?: number;
      }
    | Promise<{
        remainingAmount?: number;
        remaining?: number;
      }>
    | undefined;
};

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    fallbackHandler: undefined,
    getFallbackModelHandler: vi.fn(),
    setActiveModel: vi.fn(),
    setModel: vi.fn(),
    activateFallbackMode: vi.fn(),
    getModelAvailabilityService: vi.fn(() =>
      createAvailabilityServiceMock({
        selectedModel: FALLBACK_MODEL,
        skipped: [],
      }),
    ),
    getActiveModel: vi.fn(() => MOCK_PRO_MODEL),
    getModel: vi.fn(() => MOCK_PRO_MODEL),
    getUserTier: vi.fn(() => undefined),
    isInteractive: vi.fn(() => false),
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

    it('should return null immediately if authType is not OAuth', async () => {
      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_API_KEY,
      );
      expect(result).toBeNull();
      expect(policyHandler).not.toHaveBeenCalled();
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
        );
      } finally {
        chainSpy.mockRestore();
      }
    });

    it('wraps around to try earlier models when the failed model is last in the chain', async () => {
      // Last-resort failure (Flash) in [Pro, Flash] checks Pro before ending.
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

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
        DEFAULT_GEMINI_MODEL,
      ]);
      expect(policyHandler).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
        DEFAULT_GEMINI_MODEL,
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

    it('should pass TerminalQuotaError (429) correctly to the handler', async () => {
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

      await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
        terminalError,
      );

      expect(policyHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL,
        terminalError,
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
      vi.mocked(policyConfig.getModel).mockReturnValue(
        DEFAULT_GEMINI_MODEL_AUTO,
      );

      availability.selectFirstAvailable = vi
        .fn()
        .mockReturnValue({ selectedModel: null, skipped: [] });

      const result = await handleFallback(
        policyConfig,
        DEFAULT_GEMINI_FLASH_MODEL,
        AUTH_OAUTH,
      );

      policyHandler.mockResolvedValue('retry_once');

      expect(result).toBeNull();
      expect(policyHandler).not.toHaveBeenCalled();
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

    it('does NOT call activateFallbackMode when handler returns "retry_once"', async () => {
      policyHandler.mockResolvedValue('retry_once');

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
    });

    // --- New tests for quota filtering ---
    it('should select a fallback model only if it has available quota', async () => {
      const proPolicy = createDefaultPolicy(MOCK_PRO_MODEL);
      // Mock dependencies
      policyHandler.mockResolvedValue('retry_always');
      const mockAvailabilityService = createAvailabilityServiceMock({
        selectedModel: DEFAULT_GEMINI_FLASH_MODEL, // This might be selected if quota logic is applied correctly
        skipped: [],
      }) as unknown as MockAvailabilityWithQuotaStatus;
      // Mock getQuotaStatus on the mock service
      mockAvailabilityService.getQuotaStatus = vi
        .fn()
        .mockImplementation(async (modelName: string) => {
          if (modelName === DEFAULT_GEMINI_FLASH_MODEL)
            return { remaining: 100 };
          if (modelName === PREVIEW_GEMINI_FLASH_MODEL) return { remaining: 0 };
          return { remaining: 0 }; // Default to no quota
        });
      vi.mocked(policyConfig.getModelAvailabilityService).mockReturnValue(
        mockAvailabilityService,
      );

      // Spy on policyHelpers to mock the context building and selection
      const buildFallbackPolicyContextSpy = vi.spyOn(
        policyHelpers,
        'buildFallbackPolicyContext',
      );
      buildFallbackPolicyContextSpy.mockReturnValue({
        failedPolicy: proPolicy,
        candidates: [
          {
            ...createDefaultPolicy(DEFAULT_GEMINI_FLASH_MODEL),
            isLastResort: false,
          },
          {
            ...createDefaultPolicy(PREVIEW_GEMINI_FLASH_MODEL),
            isLastResort: false,
          },
        ],
      });

      // Mock selectFirstAvailable to simulate its behavior after candidates are filtered
      // In reality, our change modifies handleFallback *before* selectFirstAvailable is called
      // So we need to mock the function that is called *within* handleFallback: 'availability.selectFirstAvailable'
      vi.mocked(
        mockAvailabilityService.selectFirstAvailable,
      ).mockImplementation((modelNames) => {
        // This mock should reflect that only models with quota are passed to it
        if (
          modelNames.includes(DEFAULT_GEMINI_FLASH_MODEL) &&
          !modelNames.includes(PREVIEW_GEMINI_FLASH_MODEL)
        ) {
          return { selectedModel: DEFAULT_GEMINI_FLASH_MODEL, skipped: [] };
        }
        return { selectedModel: null, skipped: [] };
      });

      await handleFallback(policyConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

      // Expect the handler to be called with the model that has quota
      expect(policyHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        DEFAULT_GEMINI_FLASH_MODEL, // The model with quota
        undefined,
      );
      expect(policyConfig.activateFallbackMode).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(buildFallbackPolicyContextSpy).toHaveBeenCalled(); // Ensure context was built

      // Ensure the quota status was checked for both candidates
      expect(mockAvailabilityService.getQuotaStatus).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(mockAvailabilityService.getQuotaStatus).toHaveBeenCalledWith(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });

    it('should return null if no fallback models have available quota', async () => {
      const proPolicy = createDefaultPolicy(MOCK_PRO_MODEL);
      // Both candidates have no quota
      const noQuotaCandidate1 = {
        ...createDefaultPolicy(DEFAULT_GEMINI_FLASH_MODEL),
        isLastResort: false,
      };
      const noQuotaCandidate2 = {
        ...createDefaultPolicy(PREVIEW_GEMINI_FLASH_MODEL),
        isLastResort: false,
      };

      // Mock dependencies
      policyHandler.mockResolvedValue('retry_always'); // Handler should not be called if no fallback is found
      const mockAvailabilityService = createAvailabilityServiceMock({
        selectedModel: null, // Ensure selectFirstAvailable won't find anything even if called
        skipped: [],
      }) as unknown as MockAvailabilityWithQuotaStatus;
      mockAvailabilityService.selectFirstAvailable = vi.fn(); // Should not be called
      mockAvailabilityService.getQuotaStatus = vi
        .fn()
        .mockResolvedValue({ remaining: 0 });
      vi.mocked(policyConfig.getModelAvailabilityService).mockReturnValue(
        mockAvailabilityService,
      );

      // Spy on policyHelpers
      const buildFallbackPolicyContextSpy = vi.spyOn(
        policyHelpers,
        'buildFallbackPolicyContext',
      );
      buildFallbackPolicyContextSpy.mockReturnValue({
        failedPolicy: proPolicy,
        candidates: [noQuotaCandidate1, noQuotaCandidate2],
      });

      const result = await handleFallback(
        policyConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBeNull(); // Expect null because no suitable fallback was found
      expect(policyHandler).not.toHaveBeenCalled(); // Handler should not be called
      expect(policyConfig.activateFallbackMode).not.toHaveBeenCalled();
      expect(buildFallbackPolicyContextSpy).toHaveBeenCalled();
      expect(mockAvailabilityService.getQuotaStatus).toHaveBeenCalledWith(
        DEFAULT_GEMINI_FLASH_MODEL,
      );
      expect(mockAvailabilityService.getQuotaStatus).toHaveBeenCalledWith(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });
  });
});
