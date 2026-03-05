/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ExtensionIntegrityManager, IntegrityStatus } from './integrity.js';
import type { ExtensionInstallMetadata } from '@google/gemini-cli-core';

// Mock KeystoreService
const mockKeystoreService = {
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
    KeystoreService: vi.fn().mockImplementation(() => mockKeystoreService),
  };
});

// Mock fs
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
    // Default to keystore available
    mockKeystoreService.isAvailable.mockResolvedValue(true);
    mockKeystoreService.getPassword.mockResolvedValue('test-key');
    mockKeystoreService.setPassword.mockResolvedValue(undefined);
  });

  describe('getSecretKey', () => {
    it('should retrieve key from keystore if available', async () => {
      const key = await manager.getSecretKey();
      expect(key).toBe('test-key');
      expect(mockKeystoreService.getPassword).toHaveBeenCalledWith(
        'secret-key',
      );
    });

    it('should generate and store key in keystore if not exists', async () => {
      mockKeystoreService.getPassword.mockResolvedValue(null);
      const key = await manager.getSecretKey();
      expect(key).toHaveLength(64);
      expect(mockKeystoreService.setPassword).toHaveBeenCalledWith(
        'secret-key',
        key,
      );
    });

    it('should fallback to file-based key if keystore is unavailable', async () => {
      mockKeystoreService.isAvailable.mockResolvedValue(false);
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce('file-key');

      const key = await manager.getSecretKey();
      expect(key).toBe('file-key');
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it('should generate and store file-based key if not exists', async () => {
      mockKeystoreService.isAvailable.mockResolvedValue(false);
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

  describe('storeIntegrity and verifyIntegrity', () => {
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

    it('should store and verify integrity correctly', async () => {
      await manager.storeIntegrity('ext-name', metadata);
      const result = await manager.verifyIntegrity('ext-name', metadata);
      expect(result).toBe(IntegrityStatus.AUTHENTIC);
    });

    it('should return NOT_FOUND if metadata is missing from store', async () => {
      const result = await manager.verifyIntegrity('unknown-ext', metadata);
      expect(result).toBe(IntegrityStatus.NOT_FOUND);
    });

    it('should return TAMPERED if metadata changes', async () => {
      await manager.storeIntegrity('ext-name', metadata);
      const tamperedMetadata: ExtensionInstallMetadata = {
        ...metadata,
        source: 'https://github.com/attacker/ext',
      };
      const result = await manager.verifyIntegrity(
        'ext-name',
        tamperedMetadata,
      );
      expect(result).toBe(IntegrityStatus.TAMPERED);
    });

    it('should return TAMPERED if store signature is tampered with', async () => {
      await manager.storeIntegrity('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'tampered-signature';
      storedContent = JSON.stringify(data);

      const result = await manager.verifyIntegrity('ext-name', metadata);
      expect(result).toBe(IntegrityStatus.TAMPERED);
    });

    it('should return TAMPERED in verifyIntegrity if store is tampered, even for missing extension', async () => {
      await manager.storeIntegrity('ext-name', metadata);

      const data = JSON.parse(storedContent);
      data.signature = 'tampered-signature';
      storedContent = JSON.stringify(data);

      const result = await manager.verifyIntegrity('other-ext', metadata);
      expect(result).toBe(IntegrityStatus.TAMPERED);
    });

    it('should throw error in storeIntegrity if existing store is tampered with', async () => {
      await manager.storeIntegrity('ext-name', metadata);

      // Tamper with the store content
      const data = JSON.parse(storedContent);
      data.store['tampered-ext'] = { hash: 'fake', signature: 'fake' };
      storedContent = JSON.stringify(data);

      await expect(
        manager.storeIntegrity('other-ext', metadata),
      ).rejects.toThrow('Extension integrity store has been tampered with!');
    });

    it('should throw error in storeIntegrity if existing store is corrupted', async () => {
      storedContent = 'not-json';
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await expect(
        manager.storeIntegrity('other-ext', metadata),
      ).rejects.toThrow('Failed to parse or verify extension integrity store');
    });
  });
});
