/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeychainTokenStorage } from './keychain-token-storage.js';
import type { OAuthCredentials } from './types.js';
import { KeystoreService } from '../../services/keystore.js';
import { coreEvents } from '../../utils/events.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  const mockServiceName = 'service-name';

  beforeEach(() => {
    vi.clearAllMocks();
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

  describe('with keychain available', () => {
    beforeEach(() => {
      vi.spyOn(KeystoreService.prototype, 'isAvailable').mockResolvedValue(
        true,
      );
    });

    describe('getCredentials', () => {
      it('should return credentials if found and not expired', async () => {
        vi.spyOn(KeystoreService.prototype, 'getPassword').mockResolvedValue(
          JSON.stringify(validCredentials),
        );
        const result = await storage.getCredentials('test-server');
        expect(result).toEqual(validCredentials);
      });

      it('should return null if credentials have expired', async () => {
        const expiredCreds = {
          ...validCredentials,
          token: { ...validCredentials.token, expiresAt: Date.now() - 1000 },
        };
        vi.spyOn(KeystoreService.prototype, 'getPassword').mockResolvedValue(
          JSON.stringify(expiredCreds),
        );
        const result = await storage.getCredentials('test-server');
        expect(result).toBeNull();
      });

      it('should return null if stored data is corrupted JSON', async () => {
        vi.spyOn(KeystoreService.prototype, 'getPassword').mockResolvedValue(
          'not-json',
        );
        const result = await storage.getCredentials('test-server');
        expect(result).toBeNull();
      });
    });

    describe('setCredentials', () => {
      it('should save credentials to keychain', async () => {
        vi.useFakeTimers();
        const setPasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'setPassword')
          .mockResolvedValue(undefined);
        await storage.setCredentials(validCredentials);
        expect(setPasswordSpy).toHaveBeenCalledWith(
          'test-server',
          JSON.stringify({ ...validCredentials, updatedAt: Date.now() }),
        );
      });

      it('should throw if saving to keychain fails', async () => {
        vi.spyOn(KeystoreService.prototype, 'setPassword').mockRejectedValue(
          new Error('keychain write error'),
        );
        await expect(storage.setCredentials(validCredentials)).rejects.toThrow(
          'keychain write error',
        );
      });
    });

    describe('deleteCredentials', () => {
      it('should delete credentials from keychain', async () => {
        const deletePasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'deletePassword')
          .mockResolvedValue(true);
        await storage.deleteCredentials('test-server');
        expect(deletePasswordSpy).toHaveBeenCalledWith('test-server');
      });

      it('should throw if no credentials were found to delete', async () => {
        vi.spyOn(KeystoreService.prototype, 'deletePassword').mockResolvedValue(
          false,
        );
        await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
          'No credentials found for test-server',
        );
      });
    });

    describe('listServers', () => {
      it('should return a list of server names and filter internal keys', async () => {
        vi.spyOn(
          KeystoreService.prototype,
          'listCredentials',
        ).mockResolvedValue([
          { account: 'server1', password: '' },
          { account: '__keychain_test__abc', password: '' },
          { account: 'server2', password: '' },
        ]);
        const result = await storage.listServers();
        expect(result).toEqual(['server1', 'server2']);
      });
    });

    describe('getAllCredentials', () => {
      it('should return a map of all valid credentials, skipping expired/invalid ones', async () => {
        const creds2 = { ...validCredentials, serverName: 'server2' };
        const expiredCreds = {
          ...validCredentials,
          serverName: 'expired-server',
          token: { ...validCredentials.token, expiresAt: Date.now() - 1000 },
        };

        vi.spyOn(
          KeystoreService.prototype,
          'listCredentials',
        ).mockResolvedValue([
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
        vi.spyOn(
          KeystoreService.prototype,
          'listCredentials',
        ).mockResolvedValue([
          { account: 'server1', password: '' },
          { account: 'server2', password: '' },
        ]);
        const deletePasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'deletePassword')
          .mockResolvedValue(true);

        await storage.clearAll();

        expect(deletePasswordSpy).toHaveBeenCalledTimes(2);
        expect(deletePasswordSpy).toHaveBeenCalledWith('server1');
        expect(deletePasswordSpy).toHaveBeenCalledWith('server2');
      });
    });

    describe('Secrets', () => {
      it('should set and get a secret', async () => {
        const setPasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'setPassword')
          .mockResolvedValue(undefined);
        const getPasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'getPassword')
          .mockResolvedValue('secret-value');

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
        const deletePasswordSpy = vi
          .spyOn(KeystoreService.prototype, 'deletePassword')
          .mockResolvedValue(true);
        await storage.deleteSecret('secret-key');
        expect(deletePasswordSpy).toHaveBeenCalledWith('__secret__secret-key');
      });

      it('should list secrets', async () => {
        vi.spyOn(
          KeystoreService.prototype,
          'listCredentials',
        ).mockResolvedValue([
          { account: '__secret__secret1', password: '' },
          { account: '__secret__secret2', password: '' },
          { account: 'server1', password: '' },
        ]);
        const secrets = await storage.listSecrets();
        expect(secrets).toEqual(['secret1', 'secret2']);
      });
    });
  });

  describe('unavailability and error handling', () => {
    it.each([
      {
        method: 'setCredentials',
        args: [validCredentials],
        mockMethod: 'setPassword',
        expectedError: 'Keystore is not available',
        setup: () =>
          vi
            .spyOn(KeystoreService.prototype, 'isAvailable')
            .mockResolvedValue(false),
      },
      {
        method: 'deleteCredentials',
        args: ['test-server'],
        mockMethod: 'deletePassword',
        expectedError: 'Keystore is not available',
        setup: () =>
          vi
            .spyOn(KeystoreService.prototype, 'isAvailable')
            .mockResolvedValue(false),
      },
      {
        method: 'setSecret',
        args: ['key', 'val'],
        mockMethod: 'setPassword',
        expectedError: 'Keystore is not available',
        setup: () =>
          vi
            .spyOn(KeystoreService.prototype, 'isAvailable')
            .mockResolvedValue(false),
      },
      {
        method: 'deleteSecret',
        args: ['key'],
        mockMethod: 'deletePassword',
        expectedError: 'Keystore is not available',
        setup: () =>
          vi
            .spyOn(KeystoreService.prototype, 'isAvailable')
            .mockResolvedValue(false),
      },
    ])(
      '$method should throw when unavailable',
      async ({ method, args, mockMethod, expectedError, setup }) => {
        setup();
        vi.spyOn(
          KeystoreService.prototype,
          mockMethod as keyof KeystoreService,
        ).mockRejectedValue(new Error(expectedError));
        await expect(
          (
            storage as unknown as Record<
              string,
              (...args: unknown[]) => unknown
            >
          )[method](...args),
        ).rejects.toThrow(expectedError);
      },
    );

    it('clearAll should throw when unavailable', async () => {
      vi.spyOn(KeystoreService.prototype, 'isAvailable').mockResolvedValue(
        false,
      );
      await expect(storage.clearAll()).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it.each([
      {
        method: 'listServers',
        mockMethod: 'listCredentials',
        expectedResult: [],
        expectedFeedback: 'Failed to list servers from keychain',
      },
      {
        method: 'getAllCredentials',
        mockMethod: 'listCredentials',
        expectedResult: new Map(),
        expectedFeedback: 'Failed to get all credentials from keychain',
      },
      {
        method: 'listSecrets',
        mockMethod: 'listCredentials',
        expectedResult: [],
        expectedFeedback: 'Failed to list secrets from keychain',
      },
      {
        method: 'getSecret',
        args: ['my-key'],
        mockMethod: 'getPassword',
        expectedResult: null,
        expectedFeedback: 'Failed to get secret from keychain',
      },
    ])(
      '$method should emit error feedback on failure',
      async ({
        method,
        args = [],
        mockMethod,
        expectedResult,
        expectedFeedback,
      }) => {
        vi.spyOn(KeystoreService.prototype, 'isAvailable').mockResolvedValue(
          true,
        );
        vi.spyOn(
          KeystoreService.prototype,
          mockMethod as keyof KeystoreService,
        ).mockRejectedValue(new Error('low-level error'));
        const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

        const result = await (
          storage as unknown as Record<string, (...args: unknown[]) => unknown>
        )[method](...args);
        expect(result).toEqual(expectedResult);
        expect(emitFeedbackSpy).toHaveBeenCalledWith(
          'error',
          expectedFeedback,
          expect.any(Error),
        );
      },
    );
  });
});
