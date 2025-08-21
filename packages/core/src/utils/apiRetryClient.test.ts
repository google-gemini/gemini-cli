/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiRetryClient, ErrorFormatter } from './apiRetryClient.js';
import { AuthType } from '../core/contentGenerator.js';
import { writeFileSync, existsSync, unlinkSync } from 'fs';

// Mock console methods to avoid noise in tests
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('ApiRetryClient', () => {
  let retryClient: ApiRetryClient;
  const debugLogPath = '.gemini-cli-debug.log';

  beforeEach(() => {
    // Clean up any existing debug log
    if (existsSync(debugLogPath)) {
      unlinkSync(debugLogPath);
    }
    
    retryClient = new ApiRetryClient({
      maxRetries: 3,
      baseDelayMs: 100, // Faster for tests
      maxDelayMs: 1000,
      operation: 'TEST_OPERATION',
      enableDebugLogging: true,
    });
  });

  afterEach(() => {
    // Clean up debug log after each test
    if (existsSync(debugLogPath)) {
      unlinkSync(debugLogPath);
    }
    vi.clearAllMocks();
  });

  describe('successful requests', () => {
    it('should return result on first attempt when request succeeds', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await retryClient.makeRequest(mockFn, 'TEST_SUCCESS');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry logic', () => {
    it('should retry on 429 errors with exponential backoff', async () => {
      const error429 = { status: 429, message: 'Too Many Requests' };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error429)
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success');
      
      const result = await retryClient.makeRequest(mockFn, 'TEST_429');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 500 errors with linear backoff', async () => {
      const error500 = { status: 500, message: 'Internal Server Error' };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error500)
        .mockResolvedValue('success');
      
      const result = await retryClient.makeRequest(mockFn, 'TEST_500');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should retry on network errors', async () => {
      const networkError = { code: 'ECONNRESET', message: 'Connection reset' };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('success');
      
      const result = await retryClient.makeRequest(mockFn, 'TEST_NETWORK');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 400 errors', async () => {
      const error400 = { status: 400, message: 'Bad Request' };
      const mockFn = vi.fn().mockRejectedValue(error400);
      
      await expect(retryClient.makeRequest(mockFn, 'TEST_400')).rejects.toEqual(error400);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should respect Retry-After header', async () => {
      const error429WithRetryAfter = {
        status: 429,
        message: 'Too Many Requests',
        response: {
          headers: {
            'retry-after': '2' // 2 seconds
          }
        }
      };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error429WithRetryAfter)
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      const result = await retryClient.makeRequest(mockFn, 'TEST_RETRY_AFTER');
      const endTime = Date.now();
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      // Should have waited at least 2 seconds (allowing some tolerance for test execution)
      expect(endTime - startTime).toBeGreaterThan(1900);
    });
  });

  describe('quota error handling', () => {
    it('should handle Pro quota exceeded errors for OAuth users', async () => {
      const proQuotaError = {
        status: 429,
        message: "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
      };
      
      const mockFallback = vi.fn().mockResolvedValue('flash-model');
      const retryClientWithOAuth = new ApiRetryClient({
        maxRetries: 3,
        baseDelayMs: 100,
        authType: AuthType.LOGIN_WITH_GOOGLE,
        onPersistent429: mockFallback,
        enableDebugLogging: false,
      });
      
      const mockFn = vi.fn()
        .mockRejectedValueOnce(proQuotaError)
        .mockResolvedValue('success with flash');
      
      const result = await retryClientWithOAuth.makeRequest(mockFn, 'TEST_PRO_QUOTA');
      
      expect(result).toBe('success with flash');
      expect(mockFallback).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE, proQuotaError);
    });

    it('should handle generic quota exceeded errors for OAuth users', async () => {
      const genericQuotaError = {
        status: 429,
        message: "Quota exceeded for quota metric 'Gemini Flash Requests'"
      };
      
      const mockFallback = vi.fn().mockResolvedValue('alternative-model');
      const retryClientWithOAuth = new ApiRetryClient({
        maxRetries: 3,
        baseDelayMs: 100,
        authType: AuthType.LOGIN_WITH_GOOGLE,
        onPersistent429: mockFallback,
        enableDebugLogging: false,
      });
      
      const mockFn = vi.fn()
        .mockRejectedValueOnce(genericQuotaError)
        .mockResolvedValue('success with alternative');
      
      const result = await retryClientWithOAuth.makeRequest(mockFn, 'TEST_GENERIC_QUOTA');
      
      expect(result).toBe('success with alternative');
      expect(mockFallback).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE, genericQuotaError);
    });
  });

  describe('max retries exhausted', () => {
    it('should throw error after max retries exhausted', async () => {
      const error429 = { status: 429, message: 'Too Many Requests' };
      const mockFn = vi.fn().mockRejectedValue(error429);
      
      await expect(retryClient.makeRequest(mockFn, 'TEST_MAX_RETRIES')).rejects.toEqual(error429);
      expect(mockFn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should set proper exit code when max retries exhausted', async () => {
      const originalExitCode = process.exitCode;
      process.exitCode = 0; // Reset
      
      const error500 = { status: 500, message: 'Server Error' };
      const mockFn = vi.fn().mockRejectedValue(error500);
      
      try {
        await retryClient.makeRequest(mockFn, 'TEST_EXIT_CODE');
      } catch (error) {
        // Expected to throw
      }
      
      expect(process.exitCode).toBe(1);
      process.exitCode = originalExitCode; // Restore
    });
  });

  describe('debug logging', () => {
    it('should create debug log when enabled', async () => {
      const error429 = { status: 429, message: 'Too Many Requests' };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success');
      
      await retryClient.makeRequest(mockFn, 'TEST_DEBUG_LOG');
      
      expect(existsSync(debugLogPath)).toBe(true);
    });

    it('should not create debug log when disabled', async () => {
      const retryClientNoLog = new ApiRetryClient({
        maxRetries: 1,
        baseDelayMs: 100,
        enableDebugLogging: false,
      });
      
      const error429 = { status: 429, message: 'Too Many Requests' };
      const mockFn = vi.fn().mockRejectedValue(error429);
      
      try {
        await retryClientNoLog.makeRequest(mockFn, 'TEST_NO_LOG');
      } catch (error) {
        // Expected to throw
      }
      
      expect(existsSync(debugLogPath)).toBe(false);
    });
  });

  describe('progress display', () => {
    it('should show retry progress in non-TTY mode', async () => {
      // Mock non-TTY environment
      const originalIsTTY = process.stderr.isTTY;
      process.stderr.isTTY = false;
      
      const error429 = { status: 429, message: 'Too Many Requests' };
      const mockFn = vi.fn()
        .mockRejectedValueOnce(error429)
        .mockResolvedValue('success');
      
      await retryClient.makeRequest(mockFn, 'TEST_PROGRESS');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('TEST_PROGRESS failed, retrying in')
      );
      
      process.stderr.isTTY = originalIsTTY; // Restore
    });
  });
});

describe('ErrorFormatter', () => {
  let errorFormatter: ErrorFormatter;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    errorFormatter = new ErrorFormatter();
    process.exitCode = 0; // Reset
  });

  afterEach(() => {
    process.exitCode = originalExitCode; // Restore
    vi.clearAllMocks();
  });

  it('should format quota error messages', () => {
    const quotaError = {
      status: 429,
      message: "Quota exceeded for quota metric 'Gemini Pro Requests'"
    };
    
    errorFormatter.displayFinalError(quotaError, 'TEST_QUOTA', 3);
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('API Quota Exceeded')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should format server error messages', () => {
    const serverError = { status: 500, message: 'Internal Server Error' };
    
    errorFormatter.displayFinalError(serverError, 'TEST_SERVER', 2);
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Server Error (500)')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should format network error messages', () => {
    const networkError = { code: 'ECONNRESET', message: 'Connection reset' };
    
    errorFormatter.displayFinalError(networkError, 'TEST_NETWORK', 1);
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Network Error (ECONNRESET)')
    );
    expect(process.exitCode).toBe(1);
  });

  it('should format generic error messages', () => {
    const genericError = { status: 400, message: 'Bad Request' };
    
    errorFormatter.displayFinalError(genericError, 'TEST_GENERIC', 1);
    
    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Error Details')
    );
    expect(process.exitCode).toBe(1);
  });
});
