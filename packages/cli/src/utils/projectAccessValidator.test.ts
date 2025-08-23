/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import {
  validateProjectAccess,
  validateCurrentProjectAccess,
  forceReauthentication,
} from './projectAccessValidator.js';
import { AuthType } from '@google/gemini-cli-core';

// Mock the OAuth2 client
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn(() => ({
    getAccessToken: vi.fn(),
  })),
}));

// Mock the oauth2 module
vi.mock('../../core/src/code_assist/oauth2.js', () => ({
  getOauthClient: vi.fn(),
  clearCachedCredentialFile: vi.fn(),
}));

// Mock fetch for API calls
global.fetch = vi.fn();

describe('Project Access Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };

    // Mock successful token retrieval
    const mockClient = {
      getAccessToken: vi.fn().mockResolvedValue({ token: 'mock-token' }),
    };
    const { getOauthClient } = require('../../core/src/code_assist/oauth2.js');
    getOauthClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateProjectAccess', () => {
    it('should return true for valid project access', async () => {
      const mockClient = new OAuth2Client();
      mockClient.getAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' });

      // Mock successful API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          lifecycleState: 'ACTIVE',
          projectId: 'test-project',
        }),
      });

      const result = await validateProjectAccess('test-project', mockClient);
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://cloudresourcemanager.googleapis.com/v1/projects/test-project',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-token',
          }),
        })
      );
    });

    it('should return false for inactive project', async () => {
      const mockClient = new OAuth2Client();
      mockClient.getAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' });

      // Mock API response with inactive project
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          lifecycleState: 'DELETE_REQUESTED',
          projectId: 'test-project',
        }),
      });

      const result = await validateProjectAccess('test-project', mockClient);
      expect(result).toBe(false);
    });

    it('should return false for non-existent project', async () => {
      const mockClient = new OAuth2Client();
      mockClient.getAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' });

      // Mock API response with 403 (access denied)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const result = await validateProjectAccess('non-existent-project', mockClient);
      expect(result).toBe(false);
    });

    it('should return false when no token is available', async () => {
      const mockClient = new OAuth2Client();
      mockClient.getAccessToken = vi.fn().mockResolvedValue({ token: null });

      const result = await validateProjectAccess('test-project', mockClient);
      expect(result).toBe(false);
    });

    it('should return false when no project ID is provided', async () => {
      const mockClient = new OAuth2Client();
      const result = await validateProjectAccess('', mockClient);
      expect(result).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      const mockClient = new OAuth2Client();
      mockClient.getAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' });

      // Mock network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await validateProjectAccess('test-project', mockClient);
      expect(result).toBe(false);
    });
  });

  describe('validateCurrentProjectAccess', () => {
    it('should return true when no project is specified', async () => {
      delete process.env['GOOGLE_CLOUD_PROJECT'];

      const result = await validateCurrentProjectAccess(AuthType.LOGIN_WITH_GOOGLE, {} as any);
      expect(result).toBe(true);
    });

    it('should validate project access when project is specified', async () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';

      // Mock successful validation
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          lifecycleState: 'ACTIVE',
          projectId: 'test-project',
        }),
      });

      const result = await validateCurrentProjectAccess(AuthType.LOGIN_WITH_GOOGLE, {} as any);
      expect(result).toBe(true);
    });

    it('should return false when project access is denied', async () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'unauthorized-project';

      // Mock access denied
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await validateCurrentProjectAccess(AuthType.LOGIN_WITH_GOOGLE, {} as any);
      expect(result).toBe(false);
    });

    it('should handle authentication errors gracefully', async () => {
      process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';

      const { getOauthClient } = require('../../core/src/code_assist/oauth2.js');
      getOauthClient.mockRejectedValue(new Error('Auth failed'));

      const result = await validateCurrentProjectAccess(AuthType.LOGIN_WITH_GOOGLE, {} as any);
      expect(result).toBe(false);
    });
  });

  describe('forceReauthentication', () => {
    it('should clear cached credentials and exit with error', async () => {
      const { clearCachedCredentialFile } = require('../../core/src/code_assist/oauth2.js');
      clearCachedCredentialFile.mockResolvedValue();

      // Mock process.exit to avoid actually exiting
      const originalExit = process.exit;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      try {
        await forceReauthentication();
      } catch (error) {
        expect((error as Error).message).toBe('Process exited');
      }

      expect(clearCachedCredentialFile).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      // Restore original exit
      process.exit = originalExit;
    });

    it('should handle errors during credential clearing', async () => {
      const { clearCachedCredentialFile } = require('../../core/src/code_assist/oauth2.js');
      clearCachedCredentialFile.mockRejectedValue(new Error('Clear failed'));

      const originalExit = process.exit;
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exited');
      });

      try {
        await forceReauthentication();
      } catch (error) {
        expect((error as Error).message).toBe('Process exited');
      }

      expect(exitSpy).toHaveBeenCalledWith(1);

      // Restore original exit
      process.exit = originalExit;
    });
  });
});
