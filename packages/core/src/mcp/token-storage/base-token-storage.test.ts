/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials, OAuthToken } from './types.js';

class TestTokenStorage extends BaseTokenStorage {
  private storage = new Map<string, OAuthCredentials>();

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    return this.storage.get(serverName) || null;
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);
    this.storage.set(credentials.serverName, credentials);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    this.storage.delete(serverName);
  }

  async listServers(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    return new Map(this.storage);
  }

  async clearAll(): Promise<void> {
    this.storage.clear();
  }

  override validateCredentials(credentials: OAuthCredentials): void {
    super.validateCredentials(credentials);
  }

  override isTokenExpired(credentials: OAuthCredentials): boolean {
    return super.isTokenExpired(credentials);
  }

  override sanitizeServerName(serverName: string): string {
    return super.sanitizeServerName(serverName);
  }
}

describe('BaseTokenStorage', () => {
  let storage: TestTokenStorage;

  beforeEach(() => {
    storage = new TestTokenStorage('gemini-cli-mcp-oauth');
  });

  describe('validateCredentials', () => {
    it('should validate valid credentials', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      expect(() => storage.validateCredentials(credentials)).not.toThrow();
    });

    it('should throw for missing server name', () => {
      const credentials = {
        serverName: '',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Server name is required',
      );
    });

    it('should throw for missing token', () => {
      const credentials = {
        serverName: 'test-server',
        token: null as unknown as OAuthToken,
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Token is required',
      );
    });

    it('should throw for missing access token', () => {
      const credentials = {
        serverName: 'test-server',
        token: {
          accessToken: '',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Access token is required',
      );
    });

    it('should throw for missing token type', () => {
      const credentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: '',
        },
        updatedAt: Date.now(),
      } as OAuthCredentials;

      expect(() => storage.validateCredentials(credentials)).toThrow(
        'Token type is required',
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for tokens without expiry', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
        },
        updatedAt: Date.now(),
      };

      expect(storage.isTokenExpired(credentials)).toBe(false);
    });

    it('should return false for valid tokens', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() + 3600000,
        },
        updatedAt: Date.now(),
      };

      expect(storage.isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired tokens', () => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: Date.now() - 3600000,
        },
        updatedAt: Date.now(),
      };

      expect(storage.isTokenExpired(credentials)).toBe(true);
    });

    it('should apply 5-minute buffer for expiry check', () => {
      const fourMinutesFromNow = Date.now() + 4 * 60 * 1000;
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresAt: fourMinutesFromNow,
        },
        updatedAt: Date.now(),
      };

      expect(storage.isTokenExpired(credentials)).toBe(true);
    });
  });

  describe('sanitizeServerName', () => {
    it('should keep valid characters', () => {
      expect(storage.sanitizeServerName('test-server.example_123')).toBe(
        'test-server.example_123',
      );
    });

    it('should replace invalid characters with underscore', () => {
      expect(storage.sanitizeServerName('test@server#example')).toBe(
        'test_server_example',
      );
    });

    it('should handle special characters', () => {
      expect(storage.sanitizeServerName('test server/example:123')).toBe(
        'test_server_example_123',
      );
    });
  });
});
