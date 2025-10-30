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
import { AuthType } from '../core/contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';
import { logFlashFallback } from '../telemetry/index.js';
import type { FallbackModelHandler } from './types.js';

// Mock the telemetry logger and event class
vi.mock('../telemetry/index.js', () => ({
  logFlashFallback: vi.fn(),
  FlashFallbackEvent: class {},
}));

const MOCK_PRO_MODEL = DEFAULT_GEMINI_MODEL;
const FALLBACK_MODEL = DEFAULT_GEMINI_FLASH_MODEL;
const AUTH_OAUTH = AuthType.LOGIN_WITH_GOOGLE;
const AUTH_API_KEY = AuthType.USE_GEMINI;

const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    isInFallbackMode: vi.fn(() => false),
    setFallbackMode: vi.fn(),
    fallbackHandler: undefined,
    getContentGeneratorConfig: vi.fn(() => undefined),
    getAutoFallback: vi.fn(() => ({ enabled: false, type: 'gemini-api-key' })),
    refreshAuth: vi.fn(),
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
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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

  it('should return null if the failed model is already the fallback model', async () => {
    const result = await handleFallback(
      mockConfig,
      FALLBACK_MODEL, // Failed model is Flash
      AUTH_OAUTH,
    );
    expect(result).toBeNull();
    expect(mockHandler).not.toHaveBeenCalled();
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

  describe('when handler returns "retry"', () => {
    it('should activate fallback mode, log telemetry, and return true', async () => {
      mockHandler.mockResolvedValue('retry');

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

  describe('when handler returns "auth"', () => {
    it('should NOT activate fallback mode and return false', async () => {
      mockHandler.mockResolvedValue('auth');

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(false);
      expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
      expect(logFlashFallback).not.toHaveBeenCalled();
    });
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

  it('should pass the correct context (failedModel, fallbackModel, error, autoFallbackStatus) to the handler', async () => {
    const mockError = new Error('Quota Exceeded');
    mockHandler.mockResolvedValue('retry');

    await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH, mockError);

    expect(mockHandler).toHaveBeenCalledWith(
      MOCK_PRO_MODEL,
      FALLBACK_MODEL,
      mockError,
      { status: 'not-attempted' },
    );
  });

  it('should not call setFallbackMode or log telemetry if already in fallback mode', async () => {
    // Setup config where fallback mode is already active
    const activeFallbackConfig = createMockConfig({
      fallbackModelHandler: mockHandler,
      isInFallbackMode: vi.fn(() => true), // Already active
      setFallbackMode: vi.fn(),
    });

    mockHandler.mockResolvedValue('retry');

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

  describe('automatic fallback', () => {
    it('should automatically switch to Gemini API key when autoFallback is enabled with gemini-api-key type', async () => {
      const mockRefreshAuth = vi.fn().mockResolvedValue(undefined);
      const mockGetAutoFallback = vi.fn(() => ({
        enabled: true,
        type: 'gemini-api-key' as const,
      }));
      const mockGetContentGeneratorConfig = vi.fn(() => ({
        authType: AUTH_OAUTH,
      }));

      const configWithAutoFallback = createMockConfig({
        fallbackModelHandler: mockHandler,
        getAutoFallback: mockGetAutoFallback,
        getContentGeneratorConfig: mockGetContentGeneratorConfig,
        refreshAuth: mockRefreshAuth,
      });

      const originalEnv = process.env['GEMINI_API_KEY'];
      process.env['GEMINI_API_KEY'] = 'test-key';

      mockHandler.mockResolvedValue('retry');

      const result = await handleFallback(
        configWithAutoFallback,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(mockRefreshAuth).toHaveBeenCalledWith(AUTH_API_KEY);
      expect(mockHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        FALLBACK_MODEL,
        undefined,
        { status: 'success', authType: 'gemini-api-key' },
      );

      process.env['GEMINI_API_KEY'] = originalEnv;
    });

    it('should not auto-switch when autoFallback is enabled but no API key present', async () => {
      const mockRefreshAuth = vi.fn();
      const mockGetAutoFallback = vi.fn(() => ({
        enabled: true,
        type: 'gemini-api-key' as const,
      }));
      const mockGetContentGeneratorConfig = vi.fn(() => ({
        authType: AUTH_OAUTH,
      }));

      const configWithAutoFallback = createMockConfig({
        fallbackModelHandler: mockHandler,
        getAutoFallback: mockGetAutoFallback,
        getContentGeneratorConfig: mockGetContentGeneratorConfig,
        refreshAuth: mockRefreshAuth,
      });

      const originalEnv = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];

      mockHandler.mockResolvedValue('retry');

      const result = await handleFallback(
        configWithAutoFallback,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      expect(result).toBe(true);
      expect(mockRefreshAuth).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(
        MOCK_PRO_MODEL,
        FALLBACK_MODEL,
        undefined,
        { status: 'missing-env-vars', authType: 'gemini-api-key' },
      );

      process.env['GEMINI_API_KEY'] = originalEnv;
    });
  });
});
