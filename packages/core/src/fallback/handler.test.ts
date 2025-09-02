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
import type { FallbackHandler } from './types.js';

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
    ...overrides,
  }) as unknown as Config;

describe('handleFallback', () => {
  let mockConfig: Config;
  let mockHandler: Mock<FallbackHandler>;
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHandler = vi.fn();
    // Default setup: OAuth user, Pro model failed, handler injected
    mockConfig = createMockConfig({
      fallbackHandler: mockHandler,
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
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
      fallbackHandler: undefined,
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

  describe('when handler returns null (default)', () => {
    it('should NOT activate fallback mode and return false', async () => {
      mockHandler.mockResolvedValue(null);

      const result = await handleFallback(
        mockConfig,
        MOCK_PRO_MODEL,
        AUTH_OAUTH,
      );

      // The default case in the switch results in false
      expect(result).toBe(false);
      expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
    });
  });

  it('should pass the correct context (failedModel, fallbackModel, error) to the handler', async () => {
    const mockError = new Error('Quota Exceeded');
    mockHandler.mockResolvedValue('retry');

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
      fallbackHandler: mockHandler,
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

  it('should catch errors from the handler, log a warning, and return null', async () => {
    const handlerError = new Error('UI interaction failed');
    mockHandler.mockRejectedValue(handlerError);

    const result = await handleFallback(mockConfig, MOCK_PRO_MODEL, AUTH_OAUTH);

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Fallback UI handler failed:',
      handlerError,
    );
    expect(mockConfig.setFallbackMode).not.toHaveBeenCalled();
  });
});
