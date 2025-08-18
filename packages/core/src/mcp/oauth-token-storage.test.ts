/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MCPOAuthTokenStorage,
  MCPOAuthToken,
  MCPOAuthCredentials,
} from './oauth-token-storage.js';

// Mock the hybrid storage module
vi.mock('./token-storage/index.js', () => ({
  getDefaultTokenStorage: vi.fn(),
  resetDefaultTokenStorage: vi.fn(),
}));

import { getDefaultTokenStorage } from './token-storage/index.js';

describe('MCPOAuthTokenStorage', () => {
  const mockToken: MCPOAuthToken = {
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    tokenType: 'Bearer',
    scope: 'read write',
    expiresAt: Date.now() + 3600000, // 1 hour from now
  };

  const mockCredentials: MCPOAuthCredentials = {
    serverName: 'test-server',
    token: mockToken,
    clientId: 'test-client-id',
    tokenUrl: 'https://auth.example.com/token',
    updatedAt: Date.now(),
  };

  let mockStorage: {
    getAllCredentials: ReturnType<typeof vi.fn>;
    getCredentials: ReturnType<typeof vi.fn>;
    setCredentials: ReturnType<typeof vi.fn>;
    deleteCredentials: ReturnType<typeof vi.fn>;
    clearAll: ReturnType<typeof vi.fn>;
    listServers: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Create a mock storage implementation
    mockStorage = {
      getAllCredentials: vi.fn().mockResolvedValue(new Map()),
      getCredentials: vi.fn().mockResolvedValue(null),
      setCredentials: vi.fn().mockResolvedValue(undefined),
      deleteCredentials: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      listServers: vi.fn().mockResolvedValue([]),
    };

    // Mock getDefaultTokenStorage to return our mock
    vi.mocked(getDefaultTokenStorage).mockReturnValue(mockStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTokens', () => {
    it('should return empty map when no tokens exist', async () => {
      mockStorage.getAllCredentials.mockResolvedValue(new Map());

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(0);
      expect(mockStorage.getAllCredentials).toHaveBeenCalled();
    });

    it('should load tokens successfully', async () => {
      const tokenMap = new Map([['test-server', mockCredentials]]);
      mockStorage.getAllCredentials.mockResolvedValue(tokenMap);

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(1);
      expect(tokens.get('test-server')).toEqual(mockCredentials);
    });

    it('should handle errors gracefully', async () => {
      mockStorage.getAllCredentials.mockRejectedValue(
        new Error('Storage error'),
      );

      const tokens = await MCPOAuthTokenStorage.loadTokens();

      expect(tokens.size).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        'Failed to load MCP OAuth tokens:',
        expect.any(Error),
      );
    });
  });

  describe('saveToken', () => {
    it('should save token successfully', async () => {
      await MCPOAuthTokenStorage.saveToken(
        'test-server',
        mockToken,
        'test-client-id',
        'https://auth.example.com/token',
        'https://mcp.example.com',
      );

      expect(mockStorage.setCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'test-server',
          token: mockToken,
          clientId: 'test-client-id',
          tokenUrl: 'https://auth.example.com/token',
          mcpServerUrl: 'https://mcp.example.com',
          updatedAt: expect.any(Number),
        }),
      );
    });

    it('should save token without optional fields', async () => {
      await MCPOAuthTokenStorage.saveToken('test-server', mockToken);

      expect(mockStorage.setCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'test-server',
          token: mockToken,
          updatedAt: expect.any(Number),
        }),
      );
    });
  });

  describe('getToken', () => {
    it('should return token for existing server', async () => {
      mockStorage.getCredentials.mockResolvedValue(mockCredentials);

      const result = await MCPOAuthTokenStorage.getToken('test-server');

      expect(result).toEqual(mockCredentials);
      expect(mockStorage.getCredentials).toHaveBeenCalledWith('test-server');
    });

    it('should return null when no token exists', async () => {
      mockStorage.getCredentials.mockResolvedValue(null);

      const result = await MCPOAuthTokenStorage.getToken('test-server');

      expect(result).toBeNull();
    });

    it('should handle errors and return null', async () => {
      mockStorage.getCredentials.mockRejectedValue(new Error('Storage error'));

      const result = await MCPOAuthTokenStorage.getToken('test-server');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        'Failed to get token for test-server:',
        expect.any(Error),
      );
    });
  });

  describe('removeToken', () => {
    it('should remove token for specific server', async () => {
      await MCPOAuthTokenStorage.removeToken('test-server');

      expect(mockStorage.deleteCredentials).toHaveBeenCalledWith('test-server');
    });

    it('should handle errors gracefully', async () => {
      mockStorage.deleteCredentials.mockRejectedValue(
        new Error('Delete error'),
      );

      await MCPOAuthTokenStorage.removeToken('test-server');

      expect(console.error).toHaveBeenCalledWith(
        'Failed to remove token for test-server:',
        expect.any(Error),
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for token without expiry', () => {
      const tokenWithoutExpiry = { ...mockToken, expiresAt: undefined };
      expect(MCPOAuthTokenStorage.isTokenExpired(tokenWithoutExpiry)).toBe(
        false,
      );
    });

    it('should return false for valid token', () => {
      const validToken = { ...mockToken, expiresAt: Date.now() + 3600000 };
      expect(MCPOAuthTokenStorage.isTokenExpired(validToken)).toBe(false);
    });

    it('should return true for expired token', () => {
      const expiredToken = { ...mockToken, expiresAt: Date.now() - 3600000 };
      expect(MCPOAuthTokenStorage.isTokenExpired(expiredToken)).toBe(true);
    });

    it('should return true for token expiring within buffer time', () => {
      const soonToExpireToken = { ...mockToken, expiresAt: Date.now() + 60000 }; // 1 minute
      expect(MCPOAuthTokenStorage.isTokenExpired(soonToExpireToken)).toBe(true);
    });
  });

  describe('clearAllTokens', () => {
    it('should clear all tokens successfully', async () => {
      await MCPOAuthTokenStorage.clearAllTokens();

      expect(mockStorage.clearAll).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockStorage.clearAll.mockRejectedValue(new Error('Clear error'));

      await MCPOAuthTokenStorage.clearAllTokens();

      expect(console.error).toHaveBeenCalledWith(
        'Failed to clear MCP OAuth tokens:',
        expect.any(Error),
      );
    });
  });
});
