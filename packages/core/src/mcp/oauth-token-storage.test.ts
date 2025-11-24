/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEvents } from '../utils/events.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import { FORCE_ENCRYPTED_FILE_ENV_VAR } from './token-storage/index.js';
import type { OAuthCredentials, OAuthToken } from './token-storage/types.js';
import { GEMINI_DIR } from '../utils/paths.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('node:path', () => ({
  dirname: vi.fn(),
  join: vi.fn(),
}));

vi.mock('../config/storage.js', () => ({
  Storage: {
    getMcpOAuthTokensPath: vi.fn(),
  },
}));

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

const mockHybridTokenStorage = {
  listServers: vi.fn(),
  setCredentials: vi.fn(),
  getCredentials: vi.fn(),
  deleteCredentials: vi.fn(),
  clearAll: vi.fn(),
  getAllCredentials: vi.fn(),
};
vi.mock('./token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn(() => mockHybridTokenStorage),
}));

const ONE_HR_MS = 3600000;

describe('MCPOAuthTokenStorage', () => {
  let tokenStorage: MCPOAuthTokenStorage;

  const mockToken: OAuthToken = {
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    tokenType: 'Bearer',
    scope: 'read write',
    expiresAt: Date.now() + ONE_HR_MS,
  };

  const mockCredentials: OAuthCredentials = {
    serverName: 'test-server',
    token: mockToken,
    clientId: 'test-client-id',
    tokenUrl: 'https://auth.example.com/token',
    updatedAt: Date.now(),
  };

  describe('with encrypted flag false', () => {
    beforeEach(() => {
      vi.stubEnv(FORCE_ENCRYPTED_FILE_ENV_VAR, 'false');
      tokenStorage = new MCPOAuthTokenStorage();

      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    describe('getAllCredentials', () => {
      it('should return empty map when token file does not exist', async () => {
        vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

        const tokens = await tokenStorage.getAllCredentials();

        expect(tokens.size).toBe(0);
        expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
      });

      it('should load tokens from file successfully', async () => {
        const tokensArray = [mockCredentials];
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(tokensArray));

        const tokens = await tokenStorage.getAllCredentials();

        expect(tokens.size).toBe(1);
        expect(tokens.get('test-server')).toEqual(mockCredentials);
        expect(fs.readFile).toHaveBeenCalledWith(
          path.join('/mock/home', GEMINI_DIR, 'mcp-oauth-tokens.json'),
          'utf-8',
        );
      });

      it('should handle corrupted token file gracefully', async () => {
        vi.mocked(fs.readFile).mockResolvedValue('invalid json');

        const tokens = await tokenStorage.getAllCredentials();

        expect(tokens.size).toBe(0);
        expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Failed to load MCP OAuth tokens'),
          expect.any(Error),
        );
      });

      it('should handle file read errors other than ENOENT', async () => {
        const error = new Error('Permission denied');
        vi.mocked(fs.readFile).mockRejectedValue(error);

        const tokens = await tokenStorage.getAllCredentials();

        expect(tokens.size).toBe(0);
        expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
          'error',
          'Failed to load MCP OAuth tokens: Permission denied',
          error,
        );
      });
    });

    describe('saveToken', () => {
      it('should save token with restricted permissions', async () => {
        vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await tokenStorage.saveToken(
          'test-server',
          mockToken,
          'client-id',
          'https://token.url',
        );

        expect(fs.mkdir).toHaveBeenCalledWith(
          path.join('/mock/home', GEMINI_DIR),
          { recursive: true },
        );
        expect(fs.writeFile).toHaveBeenCalledWith(
          path.join('/mock/home', GEMINI_DIR, 'mcp-oauth-tokens.json'),
          expect.stringContaining('test-server'),
          { mode: 0o600 },
        );
      });

      it('should update existing token for same server', async () => {
        const existingCredentials: OAuthCredentials = {
          ...mockCredentials,
          serverName: 'existing-server',
        };
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([existingCredentials]),
        );
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const newToken: OAuthToken = {
          ...mockToken,
          accessToken: 'new_access_token',
        };
        await tokenStorage.saveToken('existing-server', newToken);

        const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
        const savedData = JSON.parse(
          writeCall[1] as string,
        ) as OAuthCredentials[];

        expect(savedData).toHaveLength(1);
        expect(savedData[0].token.accessToken).toBe('new_access_token');
        expect(savedData[0].serverName).toBe('existing-server');
      });

      it('should handle write errors gracefully', async () => {
        vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        const writeError = new Error('Disk full');
        vi.mocked(fs.writeFile).mockRejectedValue(writeError);

        await expect(
          tokenStorage.saveToken('test-server', mockToken),
        ).rejects.toThrow('Disk full');

        expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
          'error',
          'Failed to save MCP OAuth token: Disk full',
          writeError,
        );
      });
    });

    describe('getCredentials', () => {
      it('should return token for existing server', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([mockCredentials]),
        );

        const result = await tokenStorage.getCredentials('test-server');

        expect(result).toEqual(mockCredentials);
      });

      it('should return null for non-existent server', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([mockCredentials]),
        );

        const result = await tokenStorage.getCredentials('non-existent');

        expect(result).toBeNull();
      });

      it('should return null when no tokens file exists', async () => {
        vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

        const result = await tokenStorage.getCredentials('test-server');

        expect(result).toBeNull();
      });
    });

    describe('deleteCredentials', () => {
      it('should remove token for specific server', async () => {
        const credentials1: OAuthCredentials = {
          ...mockCredentials,
          serverName: 'server1',
        };
        const credentials2: OAuthCredentials = {
          ...mockCredentials,
          serverName: 'server2',
        };
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([credentials1, credentials2]),
        );
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await tokenStorage.deleteCredentials('server1');

        const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
        const savedData = JSON.parse(writeCall[1] as string);

        expect(savedData).toHaveLength(1);
        expect(savedData[0].serverName).toBe('server2');
      });

      it('should remove token file when no tokens remain', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([mockCredentials]),
        );
        vi.mocked(fs.unlink).mockResolvedValue(undefined);

        await tokenStorage.deleteCredentials('test-server');

        expect(fs.unlink).toHaveBeenCalledWith(
          path.join('/mock/home', GEMINI_DIR, 'mcp-oauth-tokens.json'),
        );
        expect(fs.writeFile).not.toHaveBeenCalled();
      });

      it('should handle removal of non-existent token gracefully', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([mockCredentials]),
        );

        await tokenStorage.deleteCredentials('non-existent');

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(fs.unlink).not.toHaveBeenCalled();
      });

      it('should handle file operation errors gracefully', async () => {
        vi.mocked(fs.readFile).mockResolvedValue(
          JSON.stringify([mockCredentials]),
        );
        const unlinkError = new Error('Permission denied');
        vi.mocked(fs.unlink).mockRejectedValue(unlinkError);

        await tokenStorage.deleteCredentials('test-server');

        expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
          'error',
          'Failed to remove MCP OAuth token: Permission denied',
          unlinkError,
        );
      });
    });

    describe('isTokenExpired', () => {
      it('should return false for token without expiry', () => {
        const tokenWithoutExpiry: OAuthToken = { ...mockToken };
        delete tokenWithoutExpiry.expiresAt;

        const result = tokenStorage.isTokenExpired(tokenWithoutExpiry);

        expect(result).toBe(false);
      });

      it('should return false for valid token', () => {
        const futureToken: OAuthToken = {
          ...mockToken,
          expiresAt: Date.now() + ONE_HR_MS,
        };

        const result = tokenStorage.isTokenExpired(futureToken);

        expect(result).toBe(false);
      });

      it('should return true for expired token', () => {
        const expiredToken: OAuthToken = {
          ...mockToken,
          expiresAt: Date.now() - ONE_HR_MS,
        };

        const result = tokenStorage.isTokenExpired(expiredToken);

        expect(result).toBe(true);
      });

      it('should return true for token expiring within buffer time', () => {
        const soonToExpireToken: OAuthToken = {
          ...mockToken,
          expiresAt: Date.now() + 60000, // 1 minute from now (within 5-minute buffer)
        };

        const result = tokenStorage.isTokenExpired(soonToExpireToken);

        expect(result).toBe(true);
      });
    });

    describe('clearAll', () => {
      it('should remove token file successfully', async () => {
        vi.mocked(fs.unlink).mockResolvedValue(undefined);

        await tokenStorage.clearAll();

        expect(fs.unlink).toHaveBeenCalledWith(
          path.join('/mock/home', GEMINI_DIR, 'mcp-oauth-tokens.json'),
        );
      });

      it('should handle non-existent file gracefully', async () => {
        vi.mocked(fs.unlink).mockRejectedValue({ code: 'ENOENT' });

        await tokenStorage.clearAll();

        expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
      });

      it('should handle other file errors gracefully', async () => {
        const unlinkError = new Error('Permission denied');
        vi.mocked(fs.unlink).mockRejectedValue(unlinkError);

        await tokenStorage.clearAll();

        expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
          'error',
          'Failed to clear MCP OAuth tokens: Permission denied',
          unlinkError,
        );
      });
    });
  });

  describe('with encrypted flag true', () => {
    beforeEach(() => {
      vi.stubEnv(FORCE_ENCRYPTED_FILE_ENV_VAR, 'true');
      tokenStorage = new MCPOAuthTokenStorage();

      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('should use HybridTokenStorage to list all credentials', async () => {
      mockHybridTokenStorage.getAllCredentials.mockResolvedValue(new Map());
      const servers = await tokenStorage.getAllCredentials();
      expect(mockHybridTokenStorage.getAllCredentials).toHaveBeenCalled();
      expect(servers).toEqual(new Map());
    });

    it('should use HybridTokenStorage to list servers', async () => {
      mockHybridTokenStorage.listServers.mockResolvedValue(['server1']);
      const servers = await tokenStorage.listServers();
      expect(mockHybridTokenStorage.listServers).toHaveBeenCalled();
      expect(servers).toEqual(['server1']);
    });

    it('should use HybridTokenStorage to set credentials', async () => {
      await tokenStorage.setCredentials(mockCredentials);
      expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalledWith(
        mockCredentials,
      );
    });

    it('should use HybridTokenStorage to save a token', async () => {
      const serverName = 'server1';
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      await tokenStorage.saveToken(
        serverName,
        mockToken,
        'clientId',
        'tokenUrl',
        'mcpUrl',
      );

      const expectedCredential: OAuthCredentials = {
        serverName,
        token: mockToken,
        clientId: 'clientId',
        tokenUrl: 'tokenUrl',
        mcpServerUrl: 'mcpUrl',
        updatedAt: now,
      };

      expect(mockHybridTokenStorage.setCredentials).toHaveBeenCalledWith(
        expectedCredential,
      );
      expect(path.dirname).toHaveBeenCalled();
      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should use HybridTokenStorage to get credentials', async () => {
      mockHybridTokenStorage.getCredentials.mockResolvedValue(mockCredentials);
      const result = await tokenStorage.getCredentials('server1');
      expect(mockHybridTokenStorage.getCredentials).toHaveBeenCalledWith(
        'server1',
      );
      expect(result).toBe(mockCredentials);
    });

    it('should use HybridTokenStorage to delete credentials', async () => {
      await tokenStorage.deleteCredentials('server1');
      expect(mockHybridTokenStorage.deleteCredentials).toHaveBeenCalledWith(
        'server1',
      );
    });

    it('should use HybridTokenStorage to clear all tokens', async () => {
      await tokenStorage.clearAll();
      expect(mockHybridTokenStorage.clearAll).toHaveBeenCalled();
    });
  });
});
