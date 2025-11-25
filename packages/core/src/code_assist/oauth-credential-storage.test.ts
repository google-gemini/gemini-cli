/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Credentials } from 'google-auth-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthCredentialStorage } from './oauth-credential-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { coreEvents } from '../utils/events.js';

import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

// Mock external dependencies
const mockHybridTokenStorage = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  setCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
}));
vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn(() => mockHybridTokenStorage),
}));
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    rm: vi.fn(),
  },
}));
vi.mock('node:os');
vi.mock('node:path');
vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
    emitConsoleLog: vi.fn(),
  },
}));

describe('OAuthCredentialStorage', () => {
  const mockCredentials: Credentials = {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expiry_date: Date.now() + 3600 * 1000,
    token_type: 'Bearer',
    scope: 'email profile',
  };

  const mockMcpCredentials: OAuthCredentials = {
    serverName: 'main-account',
    token: {
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      tokenType: 'Bearer',
      scope: 'email profile',
      expiresAt: mockCredentials.expiry_date!,
    },
    updatedAt: expect.any(Number),
  };

  const oldFilePath = '/mock/home/.gemini/oauth.json';

  beforeEach(() => {
    vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(null);
    vi.spyOn(mockHybridTokenStorage, 'setCredentials').mockResolvedValue(
      undefined,
    );
    vi.spyOn(mockHybridTokenStorage, 'deleteCredentials').mockResolvedValue(
      undefined,
    );

    vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));
    vi.spyOn(fs, 'rm').mockResolvedValue(undefined);

    vi.spyOn(os, 'homedir').mockReturnValue('/mock/home');
    vi.spyOn(path, 'join').mockReturnValue(oldFilePath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadCredentials', () => {
    it('should load credentials from HybridTokenStorage if available', async () => {
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        mockMcpCredentials,
      );

      const result = await OAuthCredentialStorage.loadCredentials();

      expect(mockHybridTokenStorage.getCredentials).toHaveBeenCalledWith(
        'main-account',
      );
      expect(result).toEqual(mockCredentials);
    });

    it('should fallback to migrateFromFileStorage if no credentials in HybridTokenStorage', async () => {
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        null,
      );
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(mockCredentials),
      );

      const result = await OAuthCredentialStorage.loadCredentials();

      expect(mockHybridTokenStorage.getCredentials).toHaveBeenCalledWith(
        'main-account',
      );
      expect(fs.readFile).toHaveBeenCalledWith(oldFilePath, 'utf-8');
      expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalled(); // Verify credentials were saved
      expect(fs.rm).toHaveBeenCalledWith(oldFilePath, { force: true }); // Verify old file was removed
      expect(result).toEqual(mockCredentials);
    });

    it('should return null if no credentials found and no old file to migrate', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue({
        message: 'File not found',
        code: 'ENOENT',
      });

      const result = await OAuthCredentialStorage.loadCredentials();

      expect(result).toBeNull();
    });

    it('should throw an error if loading fails', async () => {
      const mockError = new Error('HybridTokenStorage error');
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockRejectedValue(
        mockError,
      );

      await expect(OAuthCredentialStorage.loadCredentials()).rejects.toThrow(
        'Failed to load OAuth credentials',
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Failed to load OAuth credentials',
        mockError,
      );
    });

    it('should throw an error if read file fails', async () => {
      const mockError = new Error('Permission denied');
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        null,
      );
      vi.spyOn(fs, 'readFile').mockRejectedValue(mockError);

      await expect(OAuthCredentialStorage.loadCredentials()).rejects.toThrow(
        'Failed to load OAuth credentials',
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Failed to load OAuth credentials',
        mockError,
      );
    });

    it('should not throw error if migration file removal failed', async () => {
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        null,
      );
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(mockCredentials),
      );
      vi.spyOn(OAuthCredentialStorage, 'saveCredentials').mockResolvedValue(
        undefined,
      );
      vi.spyOn(fs, 'rm').mockRejectedValue(new Error('Deletion failed'));

      const result = await OAuthCredentialStorage.loadCredentials();

      expect(result).toEqual(mockCredentials);
    });

    it('should throw an error if the migration file contains invalid JSON', async () => {
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        null,
      );
      vi.spyOn(fs, 'readFile').mockResolvedValue('invalid json');

      await expect(OAuthCredentialStorage.loadCredentials()).rejects.toThrow(
        'Failed to load OAuth credentials',
      );
    });

    it('should not delete the old file if saving migrated credentials fails', async () => {
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        null,
      );
      vi.spyOn(fs, 'readFile').mockResolvedValue(
        JSON.stringify(mockCredentials),
      );
      vi.spyOn(mockHybridTokenStorage, 'setCredentials').mockRejectedValue(
        new Error('Save failed'),
      );

      await expect(OAuthCredentialStorage.loadCredentials()).rejects.toThrow(
        'Failed to load OAuth credentials',
      );

      expect(fs.rm).not.toHaveBeenCalled();
    });

    it('should return credentials even if access_token is missing from storage', async () => {
      const partialMcpCredentials = {
        ...mockMcpCredentials,
        token: {
          ...mockMcpCredentials.token,
          accessToken: undefined,
        },
      };
      vi.spyOn(mockHybridTokenStorage, 'getCredentials').mockResolvedValue(
        partialMcpCredentials,
      );

      const result = await OAuthCredentialStorage.loadCredentials();

      expect(result).toEqual({
        access_token: undefined,
        refresh_token: mockCredentials.refresh_token,
        token_type: mockCredentials.token_type,
        scope: mockCredentials.scope,
        expiry_date: mockCredentials.expiry_date,
      });
    });
  });

  describe('saveCredentials', () => {
    it('should save credentials to HybridTokenStorage', async () => {
      await OAuthCredentialStorage.saveCredentials(mockCredentials);

      expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalledWith(
        mockMcpCredentials,
      );
    });

    it('should throw an error if access_token is missing', async () => {
      const invalidCredentials: Credentials = {
        ...mockCredentials,
        access_token: undefined,
      };
      await expect(
        OAuthCredentialStorage.saveCredentials(invalidCredentials),
      ).rejects.toThrow(
        'Attempted to save credentials without an access token.',
      );
    });

    it('should handle saving credentials with null or undefined optional fields', async () => {
      const partialCredentials: Credentials = {
        access_token: 'only_access_token',
        refresh_token: null, // test null
        scope: undefined, // test undefined
      };

      await OAuthCredentialStorage.saveCredentials(partialCredentials);

      expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalledWith({
        serverName: 'main-account',
        token: {
          accessToken: 'only_access_token',
          refreshToken: undefined,
          tokenType: 'Bearer', // default
          scope: undefined,
          expiresAt: undefined,
        },
        updatedAt: expect.any(Number),
      });
    });
  });

  describe('clearCredentials', () => {
    it('should delete credentials from HybridTokenStorage', async () => {
      await OAuthCredentialStorage.clearCredentials();

      expect(mockHybridTokenStorage.deleteCredentials).toHaveBeenCalledWith(
        'main-account',
      );
    });

    it('should attempt to remove the old file-based storage', async () => {
      await OAuthCredentialStorage.clearCredentials();

      expect(fs.rm).toHaveBeenCalledWith(oldFilePath, { force: true });
    });

    it('should not throw an error if deleting old file fails', async () => {
      vi.spyOn(fs, 'rm').mockRejectedValue(new Error('File deletion failed'));

      await expect(
        OAuthCredentialStorage.clearCredentials(),
      ).resolves.toBeUndefined();
    });

    it('should throw an error if clearing from HybridTokenStorage fails', async () => {
      const mockError = new Error('Deletion error');
      vi.spyOn(mockHybridTokenStorage, 'deleteCredentials').mockRejectedValue(
        mockError,
      );

      await expect(OAuthCredentialStorage.clearCredentials()).rejects.toThrow(
        'Failed to clear OAuth credentials',
      );
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Failed to clear OAuth credentials',
        mockError,
      );
    });
  });
});
