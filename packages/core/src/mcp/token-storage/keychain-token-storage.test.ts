/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KeychainTokenStorage } from './keychain-token-storage.js';
import type { OAuthCredentials } from './types.js';
import { KeychainService } from '../../services/keychainService.js';
import { coreEvents } from '../../utils/events.js';
import { KEYCHAIN_TEST_PREFIX } from '../../services/keychainTypes.js';

describe('KeychainTokenStorage', () => {
  let storage: KeychainTokenStorage;
  const mockServiceName = 'service-name';
  let storageState: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new KeychainTokenStorage(mockServiceName);
    storageState = new Map();

    // Use stateful spies to verify logic behaviorally
    vi.spyOn(KeychainService.prototype, 'getPassword').mockImplementation(
      async (account) => storageState.get(account) ?? null,
    );
    vi.spyOn(KeychainService.prototype, 'setPassword').mockImplementation(
      async (account, value) => {
        storageState.set(account, value);
      },
    );
    vi.spyOn(KeychainService.prototype, 'deletePassword').mockImplementation(
      async (account) => storageState.delete(account),
    );
    vi.spyOn(KeychainService.prototype, 'findCredentials').mockImplementation(
      async () =>
        Array.from(storageState.entries()).map(([account, password]) => ({
          account,
          password,
        })),
    );
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
      vi.spyOn(KeychainService.prototype, 'isAvailable').mockResolvedValue(
        true,
      );
    });

    it('should store and retrieve credentials correctly', async () => {
      await storage.setCredentials(validCredentials);
      const retrieved = await storage.getCredentials('test-server');

      expect(retrieved?.token.accessToken).toBe('access-token');
      expect(retrieved?.serverName).toBe('test-server');
    });

    it('should return null if no credentials are found or they are expired', async () => {
      expect(await storage.getCredentials('missing')).toBeNull();

      const expiredCreds = {
        ...validCredentials,
        token: { ...validCredentials.token, expiresAt: Date.now() - 1000 },
      };
      await storage.setCredentials(expiredCreds);
      expect(await storage.getCredentials('test-server')).toBeNull();
    });

    it('should throw if stored data is corrupted JSON', async () => {
      storageState.set('bad-server', 'not-json');
      await expect(storage.getCredentials('bad-server')).rejects.toThrow(
        /Failed to parse/,
      );
    });

    it('should list servers and filter internal keys', async () => {
      await storage.setCredentials(validCredentials);
      await storage.setCredentials({
        ...validCredentials,
        serverName: 'server2',
      });
      storageState.set(`${KEYCHAIN_TEST_PREFIX}internal`, '...');
      storageState.set('__secret__key', '...');

      const servers = await storage.listServers();
      expect(servers).toEqual(['test-server', 'server2']);
    });

    it('should handle getAllCredentials with individual parse errors', async () => {
      await storage.setCredentials(validCredentials);
      storageState.set('bad', 'not-json');
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

      const result = await storage.getAllCredentials();
      expect(result.size).toBe(1);
      expect(emitFeedbackSpy).toHaveBeenCalled();
    });

    it('should aggregate errors in clearAll', async () => {
      storageState.set('s1', '...');
      storageState.set('s2', '...');

      // Aggregating a system error (rejection)
      vi.spyOn(KeychainService.prototype, 'deletePassword')
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('system fail'));

      await expect(storage.clearAll()).rejects.toThrow(
        /Failed to clear some credentials: system fail/,
      );

      // Aggregating a 'not found' error (returns false)
      vi.spyOn(KeychainService.prototype, 'deletePassword')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(storage.clearAll()).rejects.toThrow(
        /Failed to clear some credentials: No credentials found/,
      );
    });

    it('should manage secrets with prefix independently', async () => {
      await storage.setSecret('key1', 'val1');
      await storage.setCredentials(validCredentials);

      expect(await storage.getSecret('key1')).toBe('val1');
      expect(await storage.listSecrets()).toEqual(['key1']);
      expect(await storage.listServers()).not.toContain('key1');
    });
  });

  describe('unavailability handling', () => {
    beforeEach(() => {
      vi.spyOn(KeychainService.prototype, 'isAvailable').mockResolvedValue(
        false,
      );
      vi.spyOn(KeychainService.prototype, 'getPassword').mockRejectedValue(
        new Error('Keychain is not available'),
      );
      vi.spyOn(KeychainService.prototype, 'setPassword').mockRejectedValue(
        new Error('Keychain is not available'),
      );
      vi.spyOn(KeychainService.prototype, 'deletePassword').mockRejectedValue(
        new Error('Keychain is not available'),
      );
      vi.spyOn(KeychainService.prototype, 'findCredentials').mockRejectedValue(
        new Error('Keychain is not available'),
      );
    });

    it.each([
      { method: 'getCredentials', args: ['s'] },
      { method: 'setCredentials', args: [validCredentials] },
      { method: 'deleteCredentials', args: ['s'] },
      { method: 'clearAll', args: [] },
    ])(
      '$method should propagate unavailability error',
      async ({ method, args }) => {
        await expect(
          (
            storage as unknown as Record<
              string,
              (...args: unknown[]) => Promise<unknown>
            >
          )[method](...args),
        ).rejects.toThrow('Keychain is not available');
      },
    );

    it.each([
      { method: 'listServers' },
      { method: 'getAllCredentials' },
      { method: 'listSecrets' },
    ])('$method should emit feedback and return empty', async ({ method }) => {
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');
      expect(
        await (storage as unknown as Record<string, () => Promise<unknown>>)[
          method
        ](),
      ).toEqual(method === 'getAllCredentials' ? new Map() : []);
      expect(emitFeedbackSpy).toHaveBeenCalledWith(
        'error',
        expect.any(String),
        expect.any(Error),
      );
    });
  });
});
