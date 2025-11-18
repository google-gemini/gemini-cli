/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  type OAuthToken,
  type OAuthCredentials,
  type TokenStorage,
  TokenStorageType,
} from './types.js';

describe('token-storage types', () => {
  describe('OAuthToken interface', () => {
    it('should accept token with required fields', () => {
      const token: OAuthToken = {
        accessToken: 'access_token_123',
        tokenType: 'Bearer',
      };

      expect(token.accessToken).toBe('access_token_123');
      expect(token.tokenType).toBe('Bearer');
    });

    it('should accept token with refreshToken', () => {
      const token: OAuthToken = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        tokenType: 'Bearer',
      };

      expect(token.refreshToken).toBe('refresh_token_456');
    });

    it('should accept token with expiresAt', () => {
      const expiresAt = Date.now() + 3600000;
      const token: OAuthToken = {
        accessToken: 'access_token_123',
        tokenType: 'Bearer',
        expiresAt,
      };

      expect(token.expiresAt).toBe(expiresAt);
    });

    it('should accept token with scope', () => {
      const token: OAuthToken = {
        accessToken: 'access_token_123',
        tokenType: 'Bearer',
        scope: 'read write',
      };

      expect(token.scope).toBe('read write');
    });

    it('should accept token with all fields', () => {
      const token: OAuthToken = {
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
        scope: 'read write admin',
      };

      expect(token.accessToken).toBeDefined();
      expect(token.refreshToken).toBeDefined();
      expect(token.expiresAt).toBeDefined();
      expect(token.tokenType).toBeDefined();
      expect(token.scope).toBeDefined();
    });
  });

  describe('OAuthCredentials interface', () => {
    it('should accept credentials with required fields', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      expect(credentials.serverName).toBe('test-server');
      expect(credentials.token).toBeDefined();
      expect(credentials.updatedAt).toBeDefined();
    });

    it('should accept credentials with clientId', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          tokenType: 'Bearer',
        },
        clientId: 'client_id_789',
        updatedAt: Date.now(),
      };

      expect(credentials.clientId).toBe('client_id_789');
    });

    it('should accept credentials with tokenUrl', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          tokenType: 'Bearer',
        },
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      expect(credentials.tokenUrl).toBe('https://auth.example.com/token');
    });

    it('should accept credentials with mcpServerUrl', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          tokenType: 'Bearer',
        },
        mcpServerUrl: 'https://mcp.example.com',
        updatedAt: Date.now(),
      };

      expect(credentials.mcpServerUrl).toBe('https://mcp.example.com');
    });

    it('should accept credentials with all fields', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          refreshToken: 'refresh_token_456',
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
          scope: 'read write',
        },
        clientId: 'client_id_789',
        tokenUrl: 'https://auth.example.com/token',
        mcpServerUrl: 'https://mcp.example.com',
        updatedAt: Date.now(),
      };

      expect(credentials.serverName).toBeDefined();
      expect(credentials.token).toBeDefined();
      expect(credentials.clientId).toBeDefined();
      expect(credentials.tokenUrl).toBeDefined();
      expect(credentials.mcpServerUrl).toBeDefined();
      expect(credentials.updatedAt).toBeDefined();
    });

    it('should handle updatedAt as timestamp', () => {
      const now = Date.now();
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access_token_123',
          tokenType: 'Bearer',
        },
        updatedAt: now,
      };

      expect(typeof credentials.updatedAt).toBe('number');
      expect(credentials.updatedAt).toBe(now);
    });
  });

  describe('TokenStorage interface', () => {
    it('should implement getCredentials method', async () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn().mockResolvedValue(null),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
        listServers: vi.fn(),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn(),
      };

      await storage.getCredentials('test-server');
      expect(storage.getCredentials).toHaveBeenCalledWith('test-server');
    });

    it('should implement setCredentials method', async () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn().mockResolvedValue(undefined),
        deleteCredentials: vi.fn(),
        listServers: vi.fn(),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn(),
      };

      const credentials: OAuthCredentials = {
        serverName: 'test',
        token: { accessToken: 'token', tokenType: 'Bearer' },
        updatedAt: Date.now(),
      };

      await storage.setCredentials(credentials);
      expect(storage.setCredentials).toHaveBeenCalledWith(credentials);
    });

    it('should implement deleteCredentials method', async () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn().mockResolvedValue(undefined),
        listServers: vi.fn(),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn(),
      };

      await storage.deleteCredentials('test-server');
      expect(storage.deleteCredentials).toHaveBeenCalledWith('test-server');
    });

    it('should implement listServers method', async () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
        listServers: vi.fn().mockResolvedValue(['server1', 'server2']),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn(),
      };

      const servers = await storage.listServers();
      expect(servers).toEqual(['server1', 'server2']);
    });

    it('should implement getAllCredentials method', async () => {
      const mockMap = new Map<string, OAuthCredentials>();
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
        listServers: vi.fn(),
        getAllCredentials: vi.fn().mockResolvedValue(mockMap),
        clearAll: vi.fn(),
      };

      const allCreds = await storage.getAllCredentials();
      expect(allCreds).toBeInstanceOf(Map);
    });

    it('should implement clearAll method', async () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
        listServers: vi.fn(),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn().mockResolvedValue(undefined),
      };

      await storage.clearAll();
      expect(storage.clearAll).toHaveBeenCalled();
    });

    it('should have all required methods', () => {
      const storage: TokenStorage = {
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
        listServers: vi.fn(),
        getAllCredentials: vi.fn(),
        clearAll: vi.fn(),
      };

      expect(storage.getCredentials).toBeDefined();
      expect(storage.setCredentials).toBeDefined();
      expect(storage.deleteCredentials).toBeDefined();
      expect(storage.listServers).toBeDefined();
      expect(storage.getAllCredentials).toBeDefined();
      expect(storage.clearAll).toBeDefined();
    });
  });

  describe('TokenStorageType enum', () => {
    it('should have KEYCHAIN type', () => {
      expect(TokenStorageType.KEYCHAIN).toBe('keychain');
    });

    it('should have ENCRYPTED_FILE type', () => {
      expect(TokenStorageType.ENCRYPTED_FILE).toBe('encrypted_file');
    });

    it('should have exactly 2 storage types', () => {
      const types = Object.keys(TokenStorageType);
      expect(types).toHaveLength(2);
    });

    it('should use snake_case for ENCRYPTED_FILE', () => {
      expect(TokenStorageType.ENCRYPTED_FILE).toMatch(/_/);
    });

    it('should use lowercase values', () => {
      const values = Object.values(TokenStorageType);
      values.forEach((value) => {
        expect(value).toBe(value.toLowerCase());
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete OAuth flow', async () => {
      const mockCredentials: OAuthCredentials = {
        serverName: 'my-server',
        token: {
          accessToken: 'new_token',
          refreshToken: 'new_refresh',
          expiresAt: Date.now() + 3600000,
          tokenType: 'Bearer',
          scope: 'read write',
        },
        clientId: 'client_123',
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      const storage: TokenStorage = {
        getCredentials: vi.fn().mockResolvedValue(mockCredentials),
        setCredentials: vi.fn().mockResolvedValue(undefined),
        deleteCredentials: vi.fn().mockResolvedValue(undefined),
        listServers: vi.fn().mockResolvedValue(['my-server']),
        getAllCredentials: vi
          .fn()
          .mockResolvedValue(new Map([['my-server', mockCredentials]])),
        clearAll: vi.fn().mockResolvedValue(undefined),
      };

      // Set credentials
      await storage.setCredentials(mockCredentials);

      // Get credentials
      const retrieved = await storage.getCredentials('my-server');
      expect(retrieved?.serverName).toBe('my-server');

      // List servers
      const servers = await storage.listServers();
      expect(servers).toContain('my-server');
    });

    it('should handle expired tokens', () => {
      const expiredToken: OAuthToken = {
        accessToken: 'old_token',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000, // Expired
      };

      const isExpired = expiredToken.expiresAt! < Date.now();
      expect(isExpired).toBe(true);
    });

    it('should handle missing refresh token', () => {
      const token: OAuthToken = {
        accessToken: 'token',
        tokenType: 'Bearer',
      };

      expect(token.refreshToken).toBeUndefined();
    });
  });
});
