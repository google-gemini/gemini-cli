/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import { KeychainTokenStorage } from './keychain-token-storage.js';
import type { OAuthCredentials } from './types.js';
import { KeystoreService } from '../../services/keystore.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  const mockServiceName = 'service-name';

  let isAvailableSpy: MockInstance;
  let getPasswordSpy: MockInstance;
  let setPasswordSpy: MockInstance;
  let deletePasswordSpy: MockInstance;
  let listCredentialsSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on the prototype methods of KeystoreService
    isAvailableSpy = vi.spyOn(KeystoreService.prototype, 'isAvailable');
    getPasswordSpy = vi.spyOn(KeystoreService.prototype, 'getPassword');
    setPasswordSpy = vi.spyOn(KeystoreService.prototype, 'setPassword');
    deletePasswordSpy = vi.spyOn(KeystoreService.prototype, 'deletePassword');
    listCredentialsSpy = vi.spyOn(KeystoreService.prototype, 'listCredentials');

    storage = new KeychainTokenStorage(mockServiceName);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const validCredentials = {
    serverName: 'test-server',
    token: {
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
    },
    updatedAt: Date.now(),
  } as OAuthCredentials;

  describe('checkKeychainAvailability', () => {
    it('should return true if keystore is available', async () => {
      isAvailableSpy.mockResolvedValue(true);

      const isAvailable = await storage.checkKeychainAvailability();
      expect(isAvailable).toBe(true);
      expect(isAvailableSpy).toHaveBeenCalled();
    });

    it('should return false if keystore is unavailable', async () => {
      isAvailableSpy.mockResolvedValue(false);
      const isAvailable = await storage.checkKeychainAvailability();
      expect(isAvailable).toBe(false);
    });
  });

  describe('with keychain available', () => {
    beforeEach(() => {
      isAvailableSpy.mockResolvedValue(true);
    });

    describe('getCredentials', () => {
      it('should return null if no credentials are found', async () => {
        getPasswordSpy.mockResolvedValue(null);
        const result = await storage.getCredentials('test-server');
        expect(result).toBeNull();
        expect(getPasswordSpy).toHaveBeenCalledWith('test-server');
      });

      it('should return credentials if found and not expired', async () => {
        getPasswordSpy.mockResolvedValue(JSON.stringify(validCredentials));
        const result = await storage.getCredentials('test-server');
        expect(result).toEqual(validCredentials);
      });

      it('should return null if credentials have expired', async () => {
        const expiredCreds = {
          ...validCredentials,
          token: { ...validCredentials.token, expiresAt: Date.now() - 1000 },
        };
        getPasswordSpy.mockResolvedValue(JSON.stringify(expiredCreds));
        const result = await storage.getCredentials('test-server');
        expect(result).toBeNull();
      });

      it('should throw if stored data is corrupted JSON', async () => {
        getPasswordSpy.mockResolvedValue('not-json');
        await expect(storage.getCredentials('test-server')).rejects.toThrow(
          'Failed to parse stored credentials for test-server',
        );
      });
    });

    describe('setCredentials', () => {
      it('should save credentials to keychain', async () => {
        vi.useFakeTimers();
        setPasswordSpy.mockResolvedValue(undefined);
        await storage.setCredentials(validCredentials);
        expect(setPasswordSpy).toHaveBeenCalledWith(
          'test-server',
          JSON.stringify({ ...validCredentials, updatedAt: Date.now() }),
        );
      });

      it('should throw if saving to keychain fails', async () => {
        setPasswordSpy.mockRejectedValue(new Error('keychain write error'));
        await expect(storage.setCredentials(validCredentials)).rejects.toThrow(
          'keychain write error',
        );
      });
    });

    describe('deleteCredentials', () => {
      it('should delete credentials from keychain', async () => {
        deletePasswordSpy.mockResolvedValue(true);
        await storage.deleteCredentials('test-server');
        expect(deletePasswordSpy).toHaveBeenCalledWith('test-server');
      });

      it('should throw if no credentials were found to delete', async () => {
        deletePasswordSpy.mockResolvedValue(false);
        await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
          'No credentials found for test-server',
        );
      });
    });

    describe('listServers', () => {
      it('should return a list of server names', async () => {
        listCredentialsSpy.mockResolvedValue([
          { account: 'server1', password: '' },
          { account: 'server2', password: '' },
        ]);
        const result = await storage.listServers();
        expect(result).toEqual(['server1', 'server2']);
      });

      it('should not include internal test keys in the server list', async () => {
        listCredentialsSpy.mockResolvedValue([
          { account: 'server1', password: '' },
          { account: '__keychain_test__abc', password: '' },
          { account: 'server2', password: '' },
        ]);
        const result = await storage.listServers();
        expect(result).toEqual(['server1', 'server2']);
      });
    });

    describe('getAllCredentials', () => {
      it('should return a map of all valid credentials', async () => {
        const creds2 = { ...validCredentials, serverName: 'server2' };
        const expiredCreds = {
          ...validCredentials,
          serverName: 'expired-server',
          token: { ...validCredentials.token, expiresAt: Date.now() - 1000 },
        };

        listCredentialsSpy.mockResolvedValue([
          {
            account: 'test-server',
            password: JSON.stringify(validCredentials),
          },
          { account: 'server2', password: JSON.stringify(creds2) },
          { account: 'expired-server', password: JSON.stringify(expiredCreds) },
          { account: 'bad-server', password: 'not-json' },
        ]);

        const result = await storage.getAllCredentials();
        expect(result.size).toBe(2);
        expect(result.get('test-server')).toEqual(validCredentials);
        expect(result.get('server2')).toEqual(creds2);
      });
    });

    describe('clearAll', () => {
      it('should delete all credentials for the service', async () => {
        listCredentialsSpy.mockResolvedValue([
          { account: 'server1', password: '' },
          { account: 'server2', password: '' },
        ]);
        deletePasswordSpy.mockResolvedValue(true);

        await storage.clearAll();

        expect(deletePasswordSpy).toHaveBeenCalledTimes(2);
        expect(deletePasswordSpy).toHaveBeenCalledWith('server1');
        expect(deletePasswordSpy).toHaveBeenCalledWith('server2');
      });
    });

    describe('Secrets', () => {
      it('should set and get a secret', async () => {
        setPasswordSpy.mockResolvedValue(undefined);
        getPasswordSpy.mockResolvedValue('secret-value');

        await storage.setSecret('secret-key', 'secret-value');
        const value = await storage.getSecret('secret-key');

        expect(setPasswordSpy).toHaveBeenCalledWith(
          '__secret__secret-key',
          'secret-value',
        );
        expect(getPasswordSpy).toHaveBeenCalledWith('__secret__secret-key');
        expect(value).toBe('secret-value');
      });

      it('should delete a secret', async () => {
        deletePasswordSpy.mockResolvedValue(true);
        await storage.deleteSecret('secret-key');
        expect(deletePasswordSpy).toHaveBeenCalledWith('__secret__secret-key');
      });

      it('should list secrets', async () => {
        listCredentialsSpy.mockResolvedValue([
          { account: '__secret__secret1', password: '' },
          { account: '__secret__secret2', password: '' },
          { account: 'server1', password: '' },
        ]);
        const secrets = await storage.listSecrets();
        expect(secrets).toEqual(['secret1', 'secret2']);
      });
    });
  });

  describe('with keychain unavailable', () => {
    beforeEach(() => {
      isAvailableSpy.mockResolvedValue(false);
      getPasswordSpy.mockResolvedValue(null);
      setPasswordSpy.mockRejectedValue(new Error('Keystore is not available'));
      deletePasswordSpy.mockRejectedValue(
        new Error('Keystore is not available'),
      );
      listCredentialsSpy.mockResolvedValue([]);
    });

    it('getCredentials should return null', async () => {
      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });

    it('setCredentials should throw', async () => {
      await expect(storage.setCredentials(validCredentials)).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it('deleteCredentials should throw', async () => {
      await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it('listServers should return empty array', async () => {
      const result = await storage.listServers();
      expect(result).toEqual([]);
    });

    it('getAllCredentials should return empty map', async () => {
      const result = await storage.getAllCredentials();
      expect(result.size).toBe(0);
    });

    it('clearAll should not throw and do nothing', async () => {
      await expect(storage.clearAll()).resolves.not.toThrow();
      expect(deletePasswordSpy).not.toHaveBeenCalled();
    });

    it('secrets methods should handle unavailability', async () => {
      expect(await storage.getSecret('key')).toBeNull();
      await expect(storage.setSecret('key', 'val')).rejects.toThrow(
        'Keystore is not available',
      );
      await expect(storage.deleteSecret('key')).rejects.toThrow(
        'Keystore is not available',
      );
      expect(await storage.listSecrets()).toEqual([]);
    });
  });
});
