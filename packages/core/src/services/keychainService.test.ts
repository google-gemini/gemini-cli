/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { KeychainService } from './keychainService.js';
import { coreEvents } from '../utils/events.js';

type MockKeychain = {
  getPassword: Mock | undefined;
  setPassword: Mock | undefined;
  deletePassword: Mock | undefined;
  listCredentials: Mock | undefined;
};

const mockKeytar: MockKeychain = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  listCredentials: vi.fn(),
};

vi.mock('keytar', () => ({ default: mockKeytar }));

vi.mock('../utils/events.js', () => ({
  coreEvents: { emitTelemetryKeychainAvailability: vi.fn() },
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
    mockKeytar.listCredentials?.mockImplementation(() =>
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

    it('should return false and emit telemetry on failed functional test', async () => {
      mockKeytar.setPassword?.mockRejectedValue(new Error('locked'));

      const available = await service.isAvailable();

      expect(available).toBe(false);
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );
    });

    it('should return false and emit telemetry on module load failure', async () => {
      const originalMock = mockKeytar.getPassword;
      mockKeytar.getPassword = undefined;

      const available = await service.isAvailable();

      expect(available).toBe(false);
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );

      mockKeytar.getPassword = originalMock;
    });

    it('should cache the result and only perform the test once', async () => {
      await service.isAvailable();
      await service.isAvailable();

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

      const creds = await service.listCredentials();
      expect(creds).toHaveLength(2);
      expect(creds).toContainEqual({ account: 'acc1', password: 'secret1' });

      expect(await service.deletePassword('acc1')).toBe(true);
      expect(await service.getPassword('acc1')).toBeNull();
      expect(await service.listCredentials()).toHaveLength(1);
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
      { method: 'listCredentials', args: [] },
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
