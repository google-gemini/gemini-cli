/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { FileTokenStorage } from './file-token-storage.js';
import type { OAuthCredentials } from './types.js';
import { GEMINI_DIR } from '../../utils/paths.js';

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
  },
}));

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn(() => '/home/test'),
    hostname: vi.fn(() => 'test-host'),
    userInfo: vi.fn(() => ({ username: 'test-user' })),
  },
  homedir: vi.fn(() => '/home/test'),
  hostname: vi.fn(() => 'test-host'),
  userInfo: vi.fn(() => ({ username: 'test-user' })),
}));

describe('FileTokenStorage', () => {
  let storage: FileTokenStorage;
  const mockFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };
  const existingCredentials: OAuthCredentials = {
    serverName: 'existing-server',
    token: {
      accessToken: 'existing-token',
      tokenType: 'Bearer',
    },
    updatedAt: Date.now() - 10000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new FileTokenStorage('test-storage');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCredentials', () => {
    it('should return null when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });

    it('should return null for expired tokens', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() - 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = storage['encrypt'](
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toBeNull();
    });

    it('should return credentials for valid tokens', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 3600000,
        },
        updatedAt: Date.now(),
      };

      const encryptedData = storage['encrypt'](
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.getCredentials('test-server');
      expect(result).toEqual(credentials);
    });

    it('should handle corrupted files gracefully by backing up and returning null', async () => {
      mockFs.readFile.mockResolvedValue('corrupted-data');
      mockFs.rename.mockResolvedValue(undefined);

      const result = await storage.getCredentials('test-server');

      expect(result).toBeNull();
      expect(mockFs.rename).toHaveBeenCalled();
      const renameCall = mockFs.rename.mock.calls[0];
      expect(renameCall[0]).toContain('mcp-oauth-tokens-v2.json');
      expect(renameCall[1]).toContain('.backup-');
    });

    it('should handle corrupted file even if backup fails', async () => {
      mockFs.readFile.mockResolvedValue('corrupted-data');
      mockFs.rename.mockRejectedValue(new Error('Backup failed'));

      const result = await storage.getCredentials('test-server');

      expect(result).toBeNull();
      expect(mockFs.rename).toHaveBeenCalled();
    });
  });

  describe('auth type switching', () => {
    it('should allow saving new credentials after encountering corrupted file', async () => {
      // Simulate corrupted file on first read
      mockFs.readFile.mockResolvedValueOnce('corrupted-data');
      mockFs.rename.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      // Try to save new credentials (simulating switch from OAuth to API key)
      const newCredentials: OAuthCredentials = {
        serverName: 'new-auth-server',
        token: {
          accessToken: 'new-api-key',
          tokenType: 'ApiKey',
        },
        updatedAt: Date.now(),
      };

      // This should not throw - it should backup the corrupted file and save new credentials
      await expect(
        storage.setCredentials(newCredentials),
      ).resolves.not.toThrow();

      // Verify backup was created
      expect(mockFs.rename).toHaveBeenCalled();
      const renameCall = mockFs.rename.mock.calls[0];
      expect(renameCall[0]).toContain('mcp-oauth-tokens-v2.json');
      expect(renameCall[1]).toContain('.backup-');

      // Verify new credentials were written
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should continue even if backup fails during corruption handling', async () => {
      mockFs.readFile.mockResolvedValueOnce('corrupted-data');
      mockFs.rename.mockRejectedValue(new Error('Permission denied'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const newCredentials: OAuthCredentials = {
        serverName: 'new-server',
        token: {
          accessToken: 'new-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      // Should not throw even if backup fails
      await expect(
        storage.setCredentials(newCredentials),
      ).resolves.not.toThrow();

      // Verify we still tried to write new credentials
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('setCredentials', () => {
    it('should save credentials with encryption', async () => {
      const encryptedData = storage['encrypt'](
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(credentials);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        path.join('/home/test', GEMINI_DIR),
        { recursive: true, mode: 0o700 },
      );
      expect(mockFs.writeFile).toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[1]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(writeCall[2]).toEqual({ mode: 0o600 });
    });

    it('should update existing credentials', async () => {
      const encryptedData = storage['encrypt'](
        JSON.stringify({ 'existing-server': existingCredentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.writeFile.mockResolvedValue(undefined);

      const newCredentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'new-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(newCredentials);

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      const decrypted = storage['decrypt'](writeCall[1]);
      const saved = JSON.parse(decrypted);

      expect(saved['existing-server']).toEqual(existingCredentials);
      expect(saved['test-server'].token.accessToken).toBe('new-token');
    });
  });

  describe('deleteCredentials', () => {
    it('should throw when credentials do not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.deleteCredentials('test-server')).rejects.toThrow(
        'No credentials found for test-server',
      );
    });

    it('should delete file when last credential is removed', async () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = storage['encrypt'](
        JSON.stringify({ 'test-server': credentials }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.deleteCredentials('test-server');

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/home/test', GEMINI_DIR, 'mcp-oauth-tokens-v2.json'),
      );
    });

    it('should update file when other credentials remain', async () => {
      const credentials1: OAuthCredentials = {
        serverName: 'server1',
        token: {
          accessToken: 'token1',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const credentials2: OAuthCredentials = {
        serverName: 'server2',
        token: {
          accessToken: 'token2',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      const encryptedData = storage['encrypt'](
        JSON.stringify({ server1: credentials1, server2: credentials2 }),
      );
      mockFs.readFile.mockResolvedValue(encryptedData);
      mockFs.writeFile.mockResolvedValue(undefined);

      await storage.deleteCredentials('server1');

      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.unlink).not.toHaveBeenCalled();

      const writeCall = mockFs.writeFile.mock.calls[0];
      const decrypted = storage['decrypt'](writeCall[1]);
      const saved = JSON.parse(decrypted);

      expect(saved['server1']).toBeUndefined();
      expect(saved['server2']).toEqual(credentials2);
    });
  });

  describe('listServers', () => {
    it('should return empty list when file does not exist', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await storage.listServers();
      expect(result).toEqual([]);
    });

    it('should return list of server names', async () => {
      const credentials: Record<string, OAuthCredentials> = {
        server1: {
          serverName: 'server1',
          token: { accessToken: 'token1', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
        server2: {
          serverName: 'server2',
          token: { accessToken: 'token2', tokenType: 'Bearer' },
          updatedAt: Date.now(),
        },
      };

      const encryptedData = storage['encrypt'](JSON.stringify(credentials));
      mockFs.readFile.mockResolvedValue(encryptedData);

      const result = await storage.listServers();
      expect(result).toEqual(['server1', 'server2']);
    });
  });

  describe('clearAll', () => {
    it('should delete the token file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await storage.clearAll();

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/home/test', GEMINI_DIR, 'mcp-oauth-tokens-v2.json'),
      );
    });

    it('should not throw when file does not exist', async () => {
      mockFs.unlink.mockRejectedValue({ code: 'ENOENT' });

      await expect(storage.clearAll()).resolves.not.toThrow();
    });
  });

  describe('encryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const original = 'test-data-123';
      const encrypted = storage['encrypt'](original);
      const decrypted = storage['decrypt'](encrypted);

      expect(decrypted).toBe(original);
      expect(encrypted).not.toBe(original);
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it('should produce different encrypted output each time', () => {
      const original = 'test-data';
      const encrypted1 = storage['encrypt'](original);
      const encrypted2 = storage['encrypt'](original);

      expect(encrypted1).not.toBe(encrypted2);
      expect(storage['decrypt'](encrypted1)).toBe(original);
      expect(storage['decrypt'](encrypted2)).toBe(original);
    });

    it('should throw on invalid encrypted data format', () => {
      expect(() => storage['decrypt']('invalid-data')).toThrow(
        'Invalid encrypted data format',
      );
    });
  });
});
