/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { KeychainService } from './keychainService.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';
import { FileKeychain } from './fileKeychain.js';

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

const mockFileKeychain: MockKeychain = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn(),
  findCredentials: vi.fn(),
};

vi.mock('keytar', () => ({ default: mockKeytar }));

vi.mock('./fileKeychain.js', () => ({
  FileKeychain: vi.fn(() => mockFileKeychain),
}));

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
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    service = new KeychainService(SERVICE_NAME);
    passwords = {};

    // Stateful mock implementation for native keychain
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

    // Stateful mock implementation for fallback file keychain
    mockFileKeychain.setPassword?.mockImplementation((_svc, acc, val) => {
      passwords[acc] = val;
      return Promise.resolve();
    });
    mockFileKeychain.getPassword?.mockImplementation((_svc, acc) =>
      Promise.resolve(passwords[acc] ?? null),
    );
    mockFileKeychain.deletePassword?.mockImplementation((_svc, acc) => {
      const exists = !!passwords[acc];
      delete passwords[acc];
      return Promise.resolve(exists);
    });
    mockFileKeychain.findCredentials?.mockImplementation(() =>
      Promise.resolve(
        Object.entries(passwords).map(([account, password]) => ({
          account,
          password,
        })),
      ),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isAvailable', () => {
    it('should return true and emit telemetry on successful functional test with native keychain', async () => {
      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(mockKeytar.setPassword).toHaveBeenCalled();
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: true }),
      );
    });

    it('should return true (via fallback), log error, and emit telemetry indicating native is unavailable on failed functional test', async () => {
      mockKeytar.setPassword?.mockRejectedValue(new Error('locked'));

      const available = await service.isAvailable();

      // Because it falls back to FileKeychain, it is always available.
      expect(available).toBe(true);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('encountered an error'),
        'locked',
      );
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Using FileKeychain fallback'),
      );
      expect(FileKeychain).toHaveBeenCalled();
    });

    it('should return true (via fallback), log validation error, and emit telemetry on module load failure', async () => {
      const originalMock = mockKeytar.getPassword;
      mockKeytar.getPassword = undefined; // Break schema

      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('failed structural validation'),
        expect.objectContaining({ getPassword: expect.any(Array) }),
      );
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
      );
      expect(FileKeychain).toHaveBeenCalled();

      mockKeytar.getPassword = originalMock;
    });

    it('should log failure if functional test cycle returns false, then fallback', async () => {
      mockKeytar.getPassword?.mockResolvedValue('wrong-password');

      const available = await service.isAvailable();

      expect(available).toBe(true);
      expect(debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('functional verification failed'),
      );
      expect(FileKeychain).toHaveBeenCalled();
    });

    it('should fallback to FileKeychain when GEMINI_FORCE_FILE_STORAGE is true', async () => {
      process.env['GEMINI_FORCE_FILE_STORAGE'] = 'true';
      const available = await service.isAvailable();
      expect(available).toBe(true);
      expect(FileKeychain).toHaveBeenCalled();
      expect(coreEvents.emitTelemetryKeychainAvailability).toHaveBeenCalledWith(
        expect.objectContaining({ available: false }),
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

  // Removing 'When Unavailable' tests since the service is always available via fallback
});
