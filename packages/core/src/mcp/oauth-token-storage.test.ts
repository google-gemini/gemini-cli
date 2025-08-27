/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import type { OAuthToken, OAuthCredentials } from './token-storage/types.js';

// Mock file system operations
vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

describe('MCPOAuthTokenStorage', () => {
  const mockToken: OAuthToken = {
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    tokenType: 'Bearer',
    scope: 'read write',
    expiresAt: Date.now() + 3600000, // 1 hour from now
  };

  const mockCredentials: OAuthCredentials = {
    serverName: 'test-server',
    token: mockToken,
    clientId: 'test-client-id',
    tokenUrl: 'https://auth.example.com/token',
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTokens', () => {
    it('should return empty map when token file does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(0);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should load tokens from file successfully', async () => {
      const tokensArray = [mockCredentials];
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(tokensArray));

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(1);
      expect(tokens.get('test-server')).toEqual(mockCredentials);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'mcp-oauth-tokens.json'),
        'utf-8',
      );
    });

    it('should handle corrupted token file gracefully', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load MCP OAuth tokens'),
      );
    });

    it('should handle file read errors other than ENOENT', async () => {
      const error = new Error('Permission denied');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load MCP OAuth tokens'),
      );
    });
  });

  describe('saveToken', () => {
    it('should save token with restricted permissions', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await MCPOAuthTokenStorage.saveToken(
        'test-server',
        mockToken,
        'client-id',
        'https://token.url',
      );

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'mcp-oauth-tokens.json'),
        expect.stringContaining('test-server'),
        { mode: 0o600 },
      );
    });

    it('should update existing token for same server', async () => {
      const existingCredentials = {
        ...mockCredentials,
        serverName: 'existing-server',
      };
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([existingCredentials]),
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const newToken = { ...mockToken, accessToken: 'new_access_token' };
      await MCPOAuthTokenStorage.saveToken('existing-server', newToken);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const savedData = JSON.parse(writeCall[1] as string);

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
        MCPOAuthTokenStorage.saveToken('test-server', mockToken),
      ).rejects.toThrow('Disk full');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save MCP OAuth token'),
      );
    });
  });

  describe('getToken', () => {
    it('should return token for existing server', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([mockCredentials]),
      );

      const result = await MCPOAuthTokenStorage.getToken('test-server');

      expect(result).toEqual(mockCredentials);
    });

    it('should return null for non-existent server', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([mockCredentials]),
      );

      const result = await MCPOAuthTokenStorage.getToken('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when no tokens file exists', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      const result = await MCPOAuthTokenStorage.getToken('test-server');

      expect(result).toBeNull();
    });
  });

  describe('removeToken', () => {
    it('should remove token for specific server', async () => {
      const credentials1 = { ...mockCredentials, serverName: 'server1' };
      const credentials2 = { ...mockCredentials, serverName: 'server2' };
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([credentials1, credentials2]),
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await MCPOAuthTokenStorage.removeToken('server1');

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

      await MCPOAuthTokenStorage.removeToken('test-server');

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'mcp-oauth-tokens.json'),
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle removal of non-existent token gracefully', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([mockCredentials]),
      );

      await MCPOAuthTokenStorage.removeToken('non-existent');

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle file operation errors gracefully', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify([mockCredentials]),
      );
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      await MCPOAuthTokenStorage.removeToken('test-server');

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to remove MCP OAuth token'),
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for token without expiry', () => {
      const tokenWithoutExpiry = { ...mockToken };
      delete tokenWithoutExpiry.expiresAt;

      const result = MCPOAuthTokenStorage.isTokenExpired(tokenWithoutExpiry);

      expect(result).toBe(false);
    });

    it('should return false for valid token', () => {
      const futureToken = {
        ...mockToken,
        expiresAt: Date.now() + 3600000, // 1 hour from now
      };

      const result = MCPOAuthTokenStorage.isTokenExpired(futureToken);

      expect(result).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredToken = {
        ...mockToken,
        expiresAt: Date.now() - 3600000, // 1 hour ago
      };

      const result = MCPOAuthTokenStorage.isTokenExpired(expiredToken);

      expect(result).toBe(true);
    });

    it('should return true for token expiring within buffer time', () => {
      const soonToExpireToken = {
        ...mockToken,
        expiresAt: Date.now() + 60000, // 1 minute from now (within 5-minute buffer)
      };

      const result = MCPOAuthTokenStorage.isTokenExpired(soonToExpireToken);

      expect(result).toBe(true);
    });
  });

  describe('clearAllTokens', () => {
    it('should remove token file successfully', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await MCPOAuthTokenStorage.clearAllTokens();

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join('/mock/home', '.gemini', 'mcp-oauth-tokens.json'),
      );
    });

    it('should handle non-existent file gracefully', async () => {
      vi.mocked(fs.unlink).mockRejectedValue({ code: 'ENOENT' });

      await MCPOAuthTokenStorage.clearAllTokens();

      expect(console.error).not.toHaveBeenCalled();
    });

    it('should handle other file errors gracefully', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      await MCPOAuthTokenStorage.clearAllTokens();

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear MCP OAuth tokens'),
      );
    });
  });
});
