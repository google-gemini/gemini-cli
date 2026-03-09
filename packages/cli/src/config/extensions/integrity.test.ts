/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtensionIntegrityManager, IntegrityDataStatus } from './integrity.js';
import type { ExtensionInstallMetadata } from '@google/gemini-cli-core';

const mockKeychainService = {
  isAvailable: vi.fn(),
  getPassword: vi.fn(),
  setPassword: vi.fn(),
};

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => '/mock/home',
    GEMINI_DIR: '.gemini',
    KeychainService: vi.fn().mockImplementation(() => mockKeychainService),
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
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
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce('file-key');

      const key = await manager.getSecretKey();
      expect(key).toBe('file-key');
    });

    it('should generate and store file-based key if not exists', async () => {
      mockKeychainService.isAvailable.mockResolvedValue(false);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const key = await manager.getSecretKey();
      expect(key).toBeDefined();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'integrity.key'),
        key,
        { mode: 0o600 },
      );
    });
  });

  describe('storeExtensionIntegrity and verifyExtensionIntegrity', () => {
    const metadata: ExtensionInstallMetadata = {
      source: 'https://github.com/user/ext',
      type: 'git',
    };

    let storedContent = '';

    beforeEach(() => {
      storedContent = '';
      vi.mocked(fs.writeFileSync).mockImplementation((p, content) => {
        if (typeof p === 'string' && p.endsWith('extension_integrity.json')) {
          storedContent = content as string;
        }
      });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('extension_integrity.json')) {
          return !!storedContent;
        }
        return false;
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('extension_integrity.json')) {
          return storedContent;
        }
        return '';
      });
    });

    it('should store and verify integrity successfully', async () => {
      await manager.storeExtensionIntegrity('ext-name', metadata);
      const result = await manager.verifyExtensionIntegrity(
        'ext-name',
        metadata,
      );
      expect(result).toBe(IntegrityDataStatus.VERIFIED);
    });

    it('should return MISSING if metadata record is missing from store', async () => {
      const result = await manager.verifyExtensionIntegrity(
        'unknown-ext',
        metadata,
      );
      expect(result).toBe(IntegrityDataStatus.MISSING);
    });

    it('should return INVALID if metadata content changes', async () => {
      await manager.storeExtensionIntegrity('ext-name', metadata);
      const modifiedMetadata: ExtensionInstallMetadata = {
        ...metadata,
        source: 'https://github.com/attacker/ext',
      };
      const result = await manager.verifyExtensionIntegrity(
        'ext-name',
        modifiedMetadata,
      );
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should return INVALID if store signature is modified', async () => {
      await manager.storeExtensionIntegrity('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'invalid-signature';
      storedContent = JSON.stringify(data);

      const result = await manager.verifyExtensionIntegrity(
        'ext-name',
        metadata,
      );
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should return INVALID if signature length mismatches (e.g. truncated data)', async () => {
      await manager.storeExtensionIntegrity('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'abc';
      storedContent = JSON.stringify(data);

      const result = await manager.verifyExtensionIntegrity(
        'ext-name',
        metadata,
      );
      expect(result).toBe(IntegrityDataStatus.INVALID);
    });

    it('should throw error in storeExtensionIntegrity if existing store is modified', async () => {
      await manager.storeExtensionIntegrity('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.store['another-ext'] = { hash: 'fake', signature: 'fake' };
      storedContent = JSON.stringify(data);

      await expect(
        manager.storeExtensionIntegrity('other-ext', metadata),
      ).rejects.toThrow('Extension integrity store cannot be verified');
    });

    it('should throw error in storeExtensionIntegrity if store file is corrupted', async () => {
      storedContent = 'not-json';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        manager.storeExtensionIntegrity('other-ext', metadata),
      ).rejects.toThrow('Failed to parse extension integrity store');
    });
  });
});
