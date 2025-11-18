/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { performInitialAuth } from './auth.js';
import type { AuthType, Config } from '@google/gemini-cli-core';

describe('performInitialAuth', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      refreshAuth: vi.fn().mockResolvedValue(undefined),
    } as never;
  });

  describe('when authType is undefined', () => {
    it('should return null', async () => {
      const result = await performInitialAuth(mockConfig, undefined);

      expect(result).toBeNull();
    });

    it('should not call refreshAuth', async () => {
      await performInitialAuth(mockConfig, undefined);

      expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
    });
  });

  describe('when authType is provided', () => {
    it('should call refreshAuth with authType', async () => {
      const authType: AuthType = 'oauth';

      await performInitialAuth(mockConfig, authType);

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(authType);
      expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(1);
    });

    it('should return null on successful authentication', async () => {
      const authType: AuthType = 'oauth';

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toBeNull();
    });

    it('should return error message on authentication failure', async () => {
      const authType: AuthType = 'oauth';
      const error = new Error('Auth failed');
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(error);

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toBe('Failed to login. Message: Auth failed');
    });

    it('should handle different auth types', async () => {
      const authTypes: AuthType[] = ['oauth', 'api-key'];

      for (const authType of authTypes) {
        await performInitialAuth(mockConfig, authType);
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(authType);
      }
    });
  });

  describe('error handling', () => {
    it('should catch and format refreshAuth errors', async () => {
      const authType: AuthType = 'oauth';
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Network timeout'));

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toContain('Failed to login');
      expect(result).toContain('Network timeout');
    });

    it('should handle non-Error exceptions', async () => {
      const authType: AuthType = 'oauth';
      mockConfig.refreshAuth = vi.fn().mockRejectedValue('String error');

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toContain('Failed to login');
    });

    it('should return error message without throwing', async () => {
      const authType: AuthType = 'oauth';
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Auth error'));

      await expect(
        performInitialAuth(mockConfig, authType),
      ).resolves.not.toThrow();
    });

    it('should include error message in return value', async () => {
      const authType: AuthType = 'oauth';
      const errorMessage = 'Invalid credentials';
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error(errorMessage));

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toContain(errorMessage);
    });

    it('should handle errors with no message', async () => {
      const authType: AuthType = 'oauth';
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(new Error(''));

      const result = await performInitialAuth(mockConfig, authType);

      expect(result).toBe('Failed to login. Message: ');
    });
  });

  describe('return value', () => {
    it('should return null for successful auth', async () => {
      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(result).toBeNull();
    });

    it('should return string for failed auth', async () => {
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(new Error('Failed'));

      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(typeof result).toBe('string');
      expect(result).not.toBeNull();
    });

    it('should return null when authType is undefined', async () => {
      const result = await performInitialAuth(mockConfig, undefined);

      expect(result).toBeNull();
    });
  });

  describe('async behavior', () => {
    it('should return a Promise', () => {
      const result = performInitialAuth(mockConfig, 'oauth');

      expect(result).toBeInstanceOf(Promise);
    });

    it('should wait for refreshAuth to complete', async () => {
      let resolved = false;
      mockConfig.refreshAuth = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        resolved = true;
      });

      await performInitialAuth(mockConfig, 'oauth');

      expect(resolved).toBe(true);
    });

    it('should handle concurrent calls', async () => {
      const promise1 = performInitialAuth(mockConfig, 'oauth');
      const promise2 = performInitialAuth(mockConfig, 'api-key');

      const results = await Promise.all([promise1, promise2]);

      expect(results).toHaveLength(2);
      expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(2);
    });
  });

  describe('config interaction', () => {
    it('should use provided config instance', async () => {
      const specificMockConfig = {
        refreshAuth: vi.fn().mockResolvedValue(undefined),
      } as never;

      await performInitialAuth(specificMockConfig, 'oauth');

      expect(specificMockConfig.refreshAuth).toHaveBeenCalled();
    });

    it('should not modify config on success', async () => {
      const originalConfig = { ...mockConfig };

      await performInitialAuth(mockConfig, 'oauth');

      expect(mockConfig.refreshAuth).toBe(originalConfig.refreshAuth);
    });

    it('should not modify config on failure', async () => {
      const originalConfig = { ...mockConfig };
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(new Error('Failed'));

      await performInitialAuth(mockConfig, 'oauth');

      // Config structure should remain the same
      expect(Object.keys(mockConfig)).toEqual(Object.keys(originalConfig));
    });
  });

  describe('message format', () => {
    it('should start with "Failed to login. Message: "', async () => {
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Test error'));

      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(result).toMatch(/^Failed to login\. Message: /);
    });

    it('should include full error message', async () => {
      const errorMsg = 'Authentication credentials are invalid or expired';
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(new Error(errorMsg));

      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(result).toBe(`Failed to login. Message: ${errorMsg}`);
    });
  });

  describe('edge cases', () => {
    it('should handle null authType', async () => {
      const result = await performInitialAuth(mockConfig, null as never);

      expect(result).toBeNull();
      expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
    });

    it('should handle empty string authType', async () => {
      await performInitialAuth(mockConfig, '' as never);

      expect(mockConfig.refreshAuth).toHaveBeenCalledWith('');
    });

    it('should handle refreshAuth returning value', async () => {
      mockConfig.refreshAuth = vi.fn().mockResolvedValue('some value' as never);

      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(result).toBeNull();
    });

    it('should handle refreshAuth throwing synchronously', async () => {
      mockConfig.refreshAuth = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });

      const result = await performInitialAuth(mockConfig, 'oauth');

      expect(result).toContain('Sync error');
    });
  });
});
