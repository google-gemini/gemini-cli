/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeystoreService } from './keystore.js';
import { coreEvents } from '../utils/events.js';

// Mock keytar
const mockKeytar = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

vi.mock('keytar', () => ({
  default: mockKeytar,
}));

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitTelemetryKeychainAvailability: vi.fn(),
  },
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      const buf = Buffer.alloc(size);
      buf.fill('a');
      return buf;
    }),
  };
});

describe('KeystoreService', () => {
  let service: KeystoreService;
  const SERVICE_NAME = 'test-service';
  let passwords: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KeystoreService(SERVICE_NAME);
    passwords = {};

    mockKeytar.setPassword.mockImplementation((_svc, acc, val) => {
      passwords[acc] = val;
      return Promise.resolve();
    });
    mockKeytar.getPassword.mockImplementation((_svc, acc) =>
      Promise.resolve(passwords[acc] || null),
    );
    mockKeytar.deletePassword.mockImplementation((_svc, acc) => {
      const exists = !!passwords[acc];
      delete passwords[acc];
      return Promise.resolve(exists);
    });
    mockKeytar.findCredentials.mockImplementation(() =>
      Promise.resolve(
        Object.entries(passwords).map(([account, password]) => ({
          account,
          password,
        })),
      ),
    );
  });

  describe('getKeystore', () => {
    it('should dynamically import and return the keystore module', async () => {
      const keystore = await service.getKeystore();
      expect(keystore).toBeDefined();
      expect(keystore?.getPassword).toBeDefined();
    });
  });

  describe('isAvailable', () => {
    it('should return true and emit telemetry if the set-get-delete cycle succeeds', async () => {
      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(mockKeytar.setPassword).toHaveBeenCalled();
      expect(mockKeytar.getPassword).toHaveBeenCalled();
      expect(mockKeytar.deletePassword).toHaveBeenCalled();
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: true }),
      );
    });

    it('should return false if getPassword returns null during test', async () => {
      mockKeytar.getPassword.mockResolvedValue(null);

      const available = await service.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false if an error is thrown during the cycle', async () => {
      mockKeytar.setPassword.mockRejectedValue(new Error('keystore locked'));

      const available = await service.isAvailable();
      expect(available).toBe(false);
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );
    });

    it('should cache the availability result', async () => {
      await service.isAvailable();
      await service.isAvailable();

      // Should only call setPassword once during the first availability check
      expect(mockKeytar.setPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('Password Operations', () => {
    beforeEach(async () => {
      // Ensure it's available for these tests
      mockKeytar.getPassword.mockResolvedValue('test');
      await service.isAvailable();
      vi.clearAllMocks(); // Clear calls from isAvailable check
    });

    it('getPassword should retrieve the password from keytar', async () => {
      mockKeytar.getPassword.mockResolvedValue('secret');
      const result = await service.getPassword('my-account');

      expect(result).toBe('secret');
      expect(mockKeytar.getPassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'my-account',
      );
    });

    it('setPassword should store the password in keytar', async () => {
      await service.setPassword('my-account', 'new-secret');

      expect(mockKeytar.setPassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'my-account',
        'new-secret',
      );
    });

    it('deletePassword should remove the password from keytar', async () => {
      mockKeytar.deletePassword.mockResolvedValue(true);
      const result = await service.deletePassword('my-account');

      expect(result).toBe(true);
      expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
        SERVICE_NAME,
        'my-account',
      );
    });

    it('listCredentials should return all credentials from keytar', async () => {
      const creds = [{ account: 'a', password: 'p' }];
      mockKeytar.findCredentials.mockResolvedValue(creds);

      const result = await service.listCredentials();
      expect(result).toEqual(creds);
      expect(mockKeytar.findCredentials).toHaveBeenCalledWith(SERVICE_NAME);
    });
  });

  describe('When Unavailable', () => {
    beforeEach(() => {
      mockKeytar.setPassword.mockRejectedValue(new Error('Unavailable'));
    });

    it('getPassword should throw an error', async () => {
      await expect(service.getPassword('acc')).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it('setPassword should throw an error', async () => {
      await expect(service.setPassword('acc', 'val')).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it('deletePassword should throw an error', async () => {
      await expect(service.deletePassword('acc')).rejects.toThrow(
        'Keystore is not available',
      );
    });

    it('listCredentials should throw an error', async () => {
      await expect(service.listCredentials()).rejects.toThrow(
        'Keystore is not available',
      );
    });
  });
});
