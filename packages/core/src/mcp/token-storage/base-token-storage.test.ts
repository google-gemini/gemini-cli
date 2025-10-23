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

    it.each([
      {
        desc: 'missing server name',
        credentials: {
          serverName: '',
          token: {
            accessToken: 'access-token',
            tokenType: 'Bearer',
          },
          updatedAt: Date.now(),
        },
        expectedError: 'Server name is required',
      },
      {
        desc: 'missing token',
        credentials: {
          serverName: 'test-server',
          token: null as unknown as OAuthToken,
          updatedAt: Date.now(),
        },
        expectedError: 'Token is required',
      },
      {
        desc: 'missing access token',
        credentials: {
          serverName: 'test-server',
          token: {
            accessToken: '',
            tokenType: 'Bearer',
          },
          updatedAt: Date.now(),
        },
        expectedError: 'Access token is required',
      },
      {
        desc: 'missing token type',
        credentials: {
          serverName: 'test-server',
          token: {
            accessToken: 'access-token',
            tokenType: '',
          },
          updatedAt: Date.now(),
        },
        expectedError: 'Token type is required',
      },
    ])('should throw for $desc', ({ credentials, expectedError }) => {
      expect(() =>
        storage.validateCredentials(credentials as OAuthCredentials),
      ).toThrow(expectedError);
    });
  });

  describe('isTokenExpired', () => {
    it.each([
      {
        desc: 'tokens without expiry',
        expiresAt: undefined,
        expected: false,
      },
      {
        desc: 'valid tokens',
        expiresAt: Date.now() + 3600000,
        expected: false,
      },
      {
        desc: 'expired tokens',
        expiresAt: Date.now() - 3600000,
        expected: true,
      },
      {
        desc: 'tokens within 5-minute buffer (4 minutes from now)',
        expiresAt: Date.now() + 4 * 60 * 1000,
        expected: true,
      },
    ])('should return $expected for $desc', ({ expiresAt, expected }) => {
      const credentials: OAuthCredentials = {
        serverName: 'test-server',
        token: {
          accessToken: 'access-token',
          tokenType: 'Bearer',
          ...(expiresAt !== undefined && { expiresAt }),
        },
        updatedAt: Date.now(),
      };

      expect(storage.isTokenExpired(credentials)).toBe(expected);
    });
  });

  describe('sanitizeServerName', () => {
    it.each([
      {
        desc: 'valid characters',
        input: 'test-server.example_123',
        expected: 'test-server.example_123',
      },
      {
        desc: 'invalid characters with underscore replacement',
        input: 'test@server#example',
        expected: 'test_server_example',
      },
      {
        desc: 'special characters',
        input: 'test server/example:123',
        expected: 'test_server_example_123',
      },
    ])('should handle $desc', ({ input, expected }) => {
      expect(storage.sanitizeServerName(input)).toBe(expected);
    });
  });
});
