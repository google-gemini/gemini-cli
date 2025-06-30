/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('path');
vi.mock('os');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);
const mockOs = vi.mocked(os);

describe('Authentication Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOs.homedir.mockReturnValue('/home/user');
    mockPath.join.mockImplementation((...args) => args.join('/'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth configuration', () => {
    it('should handle missing auth config gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      
      const { getAuthConfig } = await import('./auth');
      const result = await getAuthConfig().catch(err => ({ error: err.message }));
      
      expect(result).toMatchObject({
        error: expect.stringContaining('ENOENT')
      });
    });

    it('should parse valid auth configuration', async () => {
      const mockAuthData = JSON.stringify({
        apiKey: 'test-api-key-12345',
        projectId: 'test-project-id',
        refreshToken: 'refresh-token-67890'
      });
      
      mockFs.readFile.mockResolvedValue(mockAuthData);
      
      const { getAuthConfig } = await import('./auth');
      const result = await getAuthConfig();
      
      expect(result).toMatchObject({
        apiKey: 'test-api-key-12345',
        projectId: 'test-project-id',
        refreshToken: 'refresh-token-67890'
      });
    });

    it('should handle invalid JSON in auth config', async () => {
      mockFs.readFile.mockResolvedValue('{ invalid json content }');
      
      const { getAuthConfig } = await import('./auth');
      const result = await getAuthConfig().catch(err => ({ error: err.message }));
      
      expect(result).toMatchObject({
        error: expect.stringContaining('JSON')
      });
    });

    it('should handle empty auth config file', async () => {
      mockFs.readFile.mockResolvedValue('');
      
      const { getAuthConfig } = await import('./auth');
      const result = await getAuthConfig().catch(err => ({ error: err.message }));
      
      expect(result).toMatchObject({
        error: expect.stringContaining('JSON')
      });
    });
  });

  describe('auth token management', () => {
    it('should validate auth tokens properly', async () => {
      const { validateAuthToken } = await import('./auth');
      
      expect(validateAuthToken('')).toBe(false);
      expect(validateAuthToken(null)).toBe(false);
      expect(validateAuthToken(undefined)).toBe(false);
      expect(validateAuthToken('valid-token-123')).toBe(true);
      expect(validateAuthToken('short')).toBe(false); // Too short
    });

    it('should handle token refresh successfully', async () => {
      const { refreshAuthToken } = await import('./auth');
      
      // Mock successful API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-token-123',
          expires_in: 3600
        })
      });
      
      const result = await refreshAuthToken('valid-refresh-token');
      
      expect(result).toMatchObject({
        accessToken: 'new-access-token-123',
        expiresIn: 3600
      });
    });

    it('should handle token refresh failures', async () => {
      const { refreshAuthToken } = await import('./auth');
      
      // Mock failed API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });
      
      const result = await refreshAuthToken('invalid-refresh-token').catch(err => err);
      
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('refresh');
    });

    it('should handle network errors during token refresh', async () => {
      const { refreshAuthToken } = await import('./auth');
      
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await refreshAuthToken('valid-refresh-token').catch(err => err);
      
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('Network error');
    });
  });

  describe('auth file operations', () => {
    it('should save auth configuration successfully', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockPath.dirname.mockReturnValue('/home/user/.config/gemini');
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const { saveAuthConfig } = await import('./auth');
      const authData = { 
        apiKey: 'test-key-123',
        projectId: 'test-project',
        refreshToken: 'refresh-123'
      };
      
      await saveAuthConfig(authData);
      
      expect(mockFs.mkdir).toHaveBeenCalledWith('/home/user/.config/gemini', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('auth'),
        JSON.stringify(authData, null, 2),
        'utf8'
      );
    });

    it('should handle auth file write errors', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('EACCES: permission denied'));
      mockFs.mkdir.mockResolvedValue(undefined);
      
      const { saveAuthConfig } = await import('./auth');
      const result = await saveAuthConfig({ apiKey: 'test-key' }).catch(err => err);
      
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('permission denied');
    });

    it('should handle directory creation errors', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('EACCES: permission denied'));
      
      const { saveAuthConfig } = await import('./auth');
      const result = await saveAuthConfig({ apiKey: 'test-key' }).catch(err => err);
      
      expect(result).toBeInstanceOf(Error);
    });

    it('should clear auth configuration', async () => {
      mockFs.unlink.mockResolvedValue(undefined);
      
      const { clearAuthConfig } = await import('./auth');
      await clearAuthConfig();
      
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should handle clearing non-existent auth config', async () => {
      mockFs.unlink.mockRejectedValue(new Error('ENOENT: no such file or directory'));
      
      const { clearAuthConfig } = await import('./auth');
      // Should not throw error for missing file
      await expect(clearAuthConfig()).resolves.toBeUndefined();
    });
  });

  describe('auth validation', () => {
    it('should validate API key format', async () => {
      const { isValidApiKey } = await import('./auth');
      
      expect(isValidApiKey('AIza123456789')).toBe(true);
      expect(isValidApiKey('invalid-key')).toBe(false);
      expect(isValidApiKey('')).toBe(false);
      expect(isValidApiKey(null)).toBe(false);
    });

    it('should validate project ID format', async () => {
      const { isValidProjectId } = await import('./auth');
      
      expect(isValidProjectId('my-project-123')).toBe(true);
      expect(isValidProjectId('invalid project')).toBe(false);
      expect(isValidProjectId('')).toBe(false);
    });
  });
});