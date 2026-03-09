/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { KeychainService } from './keychainService.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';

type MockKeychain = {
  getPassword: Mock | undefined;
  setPassword: Mock | undefined;
  deletePassword: Mock | undefined;
  findCredentials: Mock | undefined;
};

const mockKeytar: MockKeychain = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

vi.mock('keytar', () => ({ default: mockKeytar }));

vi.mock('../utils/events.js', () => ({
  coreEvents: { emitTelemetryKeychainAvailability: vi.fn() },
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: { log: vi.fn() },
}));

describe('KeychainService', () => {
  let service: KeychainService;
  const SERVICE_NAME = 'test-service';
  let passwords: Record<string, string> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KeychainService(SERVICE_NAME);
    passwords = {};

    // Stateful mock implementation to verify behavioral correctness
    mockKeytar.setPassword?.mockImplementation((_svc, acc, val) => {
      passwords[acc] = val;
      return Promise.resolve();
    });
    mockKeytar.getPassword?.mockImplementation((_svc, acc) =>
      Promise.resolve(passwords[acc] ?? null),
    );
    mockKeytar.deletePassword?.mockImplementation((_svc, acc) => {
      const exists = !!passwords[acc];
      delete passwords[acc];
      return Promise.resolve(exists);
    });
    mockKeytar.findCredentials?.mockImplementation(() =>
      Promise.resolve(
        Object.entries(passwords).map(([account, password]) => ({
          account,
          password,
        })),
      ),
    );
  });

  describe('isAvailable', () => {
    it('should return true and emit telemetry on successful functional test', async () => {
      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(mockKeytar.setPassword).toHaveBeenCalled();
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: true }),
      );
    });

    it('should return false, log error, and emit telemetry on failed functional test', async () => {
      mockKeytar.setPassword?.mockRejectedValue(new Error('locked'));

      const available = await service.isAvailable();

      expect(available).toBe(false);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('encountered an error'),
        'locked',
      );
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );
    });

    it('should return false, log validation error, and emit telemetry on module load failure', async () => {
      const originalMock = mockKeytar.getPassword;
      mockKeytar.getPassword = undefined; // Break schema

      const available = await service.isAvailable();

      expect(available).toBe(false);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('failed structural validation'),
        expect.objectContaining({ getPassword: expect.any(Array) }),
      );
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );

      mockKeytar.getPassword = originalMock;
    });

    it('should log failure if functional test cycle returns false', async () => {
      mockKeytar.getPassword?.mockResolvedValue('wrong-password');

      const available = await service.isAvailable();

      expect(available).toBe(false);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('functional verification failed'),
      );
    });

    it('should cache the result and handle concurrent initialization attempts once', async () => {
      await Promise.all([
        service.isAvailable(),
        service.isAvailable(),
        service.isAvailable(),
      ]);

      expect(mockKeytar.setPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('Password Operations', () => {
    beforeEach(async () => {
      await service.isAvailable();
      vi.clearAllMocks();
    });

    it('should store, retrieve, and delete passwords correctly', async () => {
      await service.setPassword('acc1', 'secret1');
      await service.setPassword('acc2', 'secret2');

      expect(await service.getPassword('acc1')).toBe('secret1');
      expect(await service.getPassword('acc2')).toBe('secret2');

      const creds = await service.findCredentials();
      expect(creds).toHaveLength(2);
      expect(creds).toContainEqual({ account: 'acc1', password: 'secret1' });

      expect(await service.deletePassword('acc1')).toBe(true);
      expect(await service.getPassword('acc1')).toBeNull();
      expect(await service.findCredentials()).toHaveLength(1);
    });

    it('getPassword should return null if key is missing', async () => {
      expect(await service.getPassword('missing')).toBeNull();
    });
  });

  describe('When Unavailable', () => {
    beforeEach(() => {
      mockKeytar.setPassword?.mockRejectedValue(new Error('Unavailable'));
    });

    it.each([
      { method: 'getPassword', args: ['acc'] },
      { method: 'setPassword', args: ['acc', 'val'] },
      { method: 'deletePassword', args: ['acc'] },
      { method: 'findCredentials', args: [] },
    ])('$method should throw a consistent error', async ({ method, args }) => {
      await expect(
        (
          service as unknown as Record<
            string,
            (...args: unknown[]) => Promise<unknown>
          >
        )[method](...args),
      ).rejects.toThrow('Keychain is not available');
    });
  });
});
