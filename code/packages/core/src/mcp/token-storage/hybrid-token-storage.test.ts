/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridTokenStorage } from './hybrid-token-storage.js';
import { KeychainTokenStorage } from './keychain-token-storage.js';
import { type OAuthCredentials, TokenStorageType } from './types.js';

vi.mock('./keychain-token-storage.js', () => ({
  KeychainTokenStorage: vi.fn().mockImplementation(() => ({
    isAvailable: vi.fn(),
    isUsingFileFallback: vi.fn(),
    getCredentials: vi.fn(),
    setCredentials: vi.fn(),
    deleteCredentials: vi.fn(),
    listServers: vi.fn(),
    getAllCredentials: vi.fn(),
    clearAll: vi.fn(),
  })),
}));

vi.mock('../../code_assist/oauth-credential-storage.js', () => ({
  OAuthCredentialStorage: {
    saveCredentials: vi.fn(),
    loadCredentials: vi.fn(),
    clearCredentials: vi.fn(),
  },
}));

vi.mock('../../core/apiKeyCredentialStorage.js', () => ({
  loadApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
}));

interface MockStorage {
  isAvailable?: ReturnType<typeof vi.fn>;
  isUsingFileFallback: ReturnType<typeof vi.fn>;
  getCredentials: ReturnType<typeof vi.fn>;
  setCredentials: ReturnType<typeof vi.fn>;
  deleteCredentials: ReturnType<typeof vi.fn>;
  listServers: ReturnType<typeof vi.fn>;
  getAllCredentials: ReturnType<typeof vi.fn>;
  clearAll: ReturnType<typeof vi.fn>;
}

describe('HybridTokenStorage', () => {
  let storage: HybridTokenStorage;
  let mockKeychainStorage: MockStorage;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Create mock instances before creating HybridTokenStorage
    mockKeychainStorage = {
      isAvailable: vi.fn(),
      isUsingFileFallback: vi.fn(),
      getCredentials: vi.fn(),
      setCredentials: vi.fn(),
      deleteCredentials: vi.fn(),
      listServers: vi.fn(),
      getAllCredentials: vi.fn(),
      clearAll: vi.fn(),
    };

    (
      KeychainTokenStorage as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(() => mockKeychainStorage);

    storage = new HybridTokenStorage('test-service');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('storage selection', () => {
    it('should use keychain normally', async () => {
      mockKeychainStorage.isUsingFileFallback.mockResolvedValue(false);
      mockKeychainStorage.getCredentials.mockResolvedValue(null);

      await storage.getCredentials('test-server');

      expect(mockKeychainStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await storage.getStorageType()).toBe(TokenStorageType.KEYCHAIN);
    });

    it('should use file storage when isUsingFileFallback is true', async () => {
      mockKeychainStorage.isUsingFileFallback.mockResolvedValue(true);
      mockKeychainStorage.getCredentials.mockResolvedValue(null);

      const forceStorage = new HybridTokenStorage('test-service-forced');
      await forceStorage.getCredentials('test-server');

      expect(mockKeychainStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(await forceStorage.getStorageType()).toBe(
        TokenStorageType.ENCRYPTED_FILE,
      );
    });
  });

  describe('getCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      mockKeychainStorage.getCredentials.mockResolvedValue(credentials);

      const result = await storage.getCredentials('test-server');

      expect(result).toEqual(credentials);
      expect(mockKeychainStorage.getCredentials).toHaveBeenCalledWith(
        'test-server',
      );
    });
  });

  describe('setCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      mockKeychainStorage.setCredentials.mockResolvedValue(undefined);

      await storage.setCredentials(credentials);

      expect(mockKeychainStorage.setCredentials).toHaveBeenCalledWith(
        credentials,
      );
    });
  });

  describe('deleteCredentials', () => {
    it('should delegate to selected storage', async () => {
      mockKeychainStorage.deleteCredentials.mockResolvedValue(undefined);

      await storage.deleteCredentials('test-server');

      expect(mockKeychainStorage.deleteCredentials).toHaveBeenCalledWith(
        'test-server',
      );
    });
  });

  describe('listServers', () => {
    it('should delegate to selected storage', async () => {
      const servers = ['server1', 'server2'];
      mockKeychainStorage.listServers.mockResolvedValue(servers);

      const result = await storage.listServers();

      expect(result).toEqual(servers);
      expect(mockKeychainStorage.listServers).toHaveBeenCalled();
    });
  });

  describe('getAllCredentials', () => {
    it('should delegate to selected storage', async () => {
      const credentialsMap = new Map([
        [
          'server1',
          {
            serverName: 'server1',
            token: { accessToken: 'token1', tokenType: 'Bearer' },
            updatedAt: Date.now(),
          },
        ],
        [
          'server2',
          {
            serverName: 'server2',
            token: { accessToken: 'token2', tokenType: 'Bearer' },
            updatedAt: Date.now(),
          },
        ],
      ]);

      mockKeychainStorage.getAllCredentials.mockResolvedValue(credentialsMap);

      const result = await storage.getAllCredentials();

      expect(result).toEqual(credentialsMap);
      expect(mockKeychainStorage.getAllCredentials).toHaveBeenCalled();
    });
  });

  describe('clearAll', () => {
    it('should delegate to selected storage', async () => {
      mockKeychainStorage.clearAll.mockResolvedValue(undefined);

      await storage.clearAll();

      expect(mockKeychainStorage.clearAll).toHaveBeenCalled();
    });
  });
});
