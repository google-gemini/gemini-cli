/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtensionIntegrityManager, IntegrityDataStatus } from './integrity.js';
import type { ExtensionInstallMetadata } from '../config.js';

const mockKeychainService = {
  isAvailable: vi.fn(),
  getPassword: vi.fn(),
  setPassword: vi.fn(),
};

vi.mock('../../services/keychainService.js', () => ({
  KeychainService: vi.fn().mockImplementation(() => mockKeychainService),
}));

vi.mock('../../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/paths.js')>();
  return {
    ...actual,
    homedir: () => '/mock/home',
    GEMINI_DIR: '.gemini',
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('ExtensionIntegrityManager', () => {
  let manager: ExtensionIntegrityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ExtensionIntegrityManager();
    mockKeychainService.isAvailable.mockResolvedValue(true);
    mockKeychainService.getPassword.mockResolvedValue('test-key');
    mockKeychainService.setPassword.mockResolvedValue(undefined);
  });

  describe('getSecretKey', () => {
    it('should retrieve key from keychain if available', async () => {
      const key = await manager.getSecretKey();
      expect(key).toBe('test-key');
      expect(mockKeychainService.getPassword).toHaveBeenCalledWith(
        'secret-key',
      );
    });

    it('should generate and store key in keychain if not exists', async () => {
      mockKeychainService.getPassword.mockResolvedValue(null);
      const key = await manager.getSecretKey();
      expect(key).toHaveLength(64);
      expect(mockKeychainService.setPassword).toHaveBeenCalledWith(
        'secret-key',
        key,
      );
    });

    it('should fallback to file-based key if keychain is unavailable', async () => {
      mockKeychainService.isAvailable.mockResolvedValue(false);
      vi.mocked(fs.promises.readFile).mockResolvedValueOnce('file-key');

      const key = await manager.getSecretKey();
      expect(key).toBe('file-key');
    });

    it('should generate and store file-based key if not exists', async () => {
      mockKeychainService.isAvailable.mockResolvedValue(false);
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        Object.assign(new Error(), { code: 'ENOENT' }),
      );

      const key = await manager.getSecretKey();
      expect(key).toBeDefined();
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'integrity.key'),
        key,
        { mode: 0o600 },
      );
    });
  });

  describe('store and verify', () => {
    const metadata: ExtensionInstallMetadata = {
      source: 'https://github.com/user/ext',
      type: 'git',
    };

    let storedContent = '';

    beforeEach(() => {
      storedContent = '';

      const isIntegrityStore = (p: unknown) =>
        typeof p === 'string' &&
        (p.endsWith('extension_integrity.json') ||
          p.endsWith('extension_integrity.json.tmp'));

      vi.mocked(fs.promises.writeFile).mockImplementation(
        async (p, content) => {
          if (isIntegrityStore(p)) {
            storedContent = content as string;
          }
        },
      );

      vi.mocked(fs.promises.readFile).mockImplementation(async (p) => {
        if (isIntegrityStore(p)) {
          if (!storedContent) {
            throw Object.assign(new Error('File not found'), {
              code: 'ENOENT',
            });
          }
          return storedContent;
        }
        return '';
      });

      vi.mocked(fs.promises.rename).mockResolvedValue(undefined);
    });

    it('should store and verify integrity successfully', async () => {
      await manager.store('ext-name', metadata);
      const result = await manager.verify('ext-name', metadata);
      expect(result).toBe(IntegrityDataStatus.VERIFIED);
      expect(fs.promises.rename).toHaveBeenCalled();
    });

    it('should return MISSING if metadata record is missing from store', async () => {
      const result = await manager.verify('unknown-ext', metadata);
      expect(result).toBe(IntegrityDataStatus.MISSING);
    });

    it('should return INVALID if metadata content changes', async () => {
      await manager.store('ext-name', metadata);
      const modifiedMetadata: ExtensionInstallMetadata = {
        ...metadata,
        source: 'https://github.com/attacker/ext',
      };
      const result = await manager.verify('ext-name', modifiedMetadata);
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should return INVALID if store signature is modified', async () => {
      await manager.store('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'invalid-signature';
      storedContent = JSON.stringify(data);

      const result = await manager.verify('ext-name', metadata);
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should return INVALID if signature length mismatches (e.g. truncated data)', async () => {
      await manager.store('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'abc';
      storedContent = JSON.stringify(data);

      const result = await manager.verify('ext-name', metadata);
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should throw error in store if existing store is modified', async () => {
      await manager.store('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.store['another-ext'] = { hash: 'fake', signature: 'fake' };
      storedContent = JSON.stringify(data);

      await expect(manager.store('other-ext', metadata)).rejects.toThrow(
        'Extension integrity store cannot be verified',
      );
    });

    it('should throw error in store if store file is corrupted', async () => {
      storedContent = 'not-json';

      await expect(manager.store('other-ext', metadata)).rejects.toThrow(
        'Failed to parse extension integrity store',
      );
    });
  });
});
