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
      ['tokens without expiry', undefined, false],
      ['valid tokens', Date.now() + 3600000, false],
      ['expired tokens', Date.now() - 3600000, true],
      [
        'tokens within 5-minute buffer (4 minutes from now)',
        Date.now() + 4 * 60 * 1000,
        true,
      ],
    ])('should return %s for %s', (_, expiresAt, expected) => {
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
      [
        'valid characters',
        'test-server.example_123',
        'test-server.example_123',
      ],
      [
        'invalid characters with underscore replacement',
        'test@server#example',
        'test_server_example',
      ],
      [
        'special characters',
        'test server/example:123',
        'test_server_example_123',
      ],
    ])('should handle %s', (_, input, expected) => {
      expect(storage.sanitizeServerName(input)).toBe(expected);
    });
  });
});
