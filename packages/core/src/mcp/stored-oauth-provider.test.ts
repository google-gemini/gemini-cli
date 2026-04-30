/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPOAuthConfig } from './oauth-provider.js';
import { StoredOAuthMcpProvider } from './stored-oauth-provider.js';
import type { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import type { OAuthCredentials } from './token-storage/types.js';

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn(),
}));

describe('StoredOAuthMcpProvider', () => {
  const oauthConfig: MCPOAuthConfig = {
    tokenUrl: 'https://auth.example.com/token',
  };

  const storedCredentials: OAuthCredentials = {
    serverName: 'test-server',
    token: {
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
      tokenType: 'Bearer',
      scope: 'scope-a scope-b',
      expiresAt: Date.now() + 3600_000,
    },
    clientId: 'stored-client-id',
    tokenUrl: 'https://auth.example.com/token',
    mcpServerUrl: 'https://example.com/mcp',
    updatedAt: Date.now(),
  };

  let tokenStorage: MCPOAuthTokenStorage;

  beforeEach(() => {
    tokenStorage = {
      getCredentials: vi.fn().mockResolvedValue(storedCredentials),
      saveToken: vi.fn().mockResolvedValue(undefined),
      deleteCredentials: vi.fn().mockResolvedValue(undefined),
    } as unknown as MCPOAuthTokenStorage;
  });

  it('returns stored client information and tokens in SDK shape', async () => {
    const provider = new StoredOAuthMcpProvider(
      'test-server',
      oauthConfig,
      tokenStorage,
    );

    await expect(provider.clientInformation()).resolves.toEqual({
      client_id: 'stored-client-id',
      client_secret: undefined,
      token_endpoint_auth_method: 'none',
    });

    const tokens = await provider.tokens();
    expect(tokens?.access_token).toBe('stored-access-token');
    expect(tokens?.refresh_token).toBe('stored-refresh-token');
    expect(tokens?.token_type).toBe('Bearer');
    expect(tokens?.scope).toBe('scope-a scope-b');
    expect(tokens?.expires_in).toBeGreaterThan(0);
  });

  it('saves refreshed tokens and preserves the previous refresh token when omitted', async () => {
    vi.mocked(tokenStorage.getCredentials)
      .mockResolvedValueOnce(storedCredentials)
      .mockResolvedValueOnce({
        ...storedCredentials,
        token: {
          ...storedCredentials.token,
          accessToken: 'refreshed-access-token',
        },
      });

    const provider = new StoredOAuthMcpProvider(
      'test-server',
      oauthConfig,
      tokenStorage,
    );

    await provider.saveTokens({
      access_token: 'refreshed-access-token',
      token_type: 'Bearer',
      expires_in: 1800,
    });

    expect(tokenStorage.saveToken).toHaveBeenCalledWith(
      'test-server',
      expect.objectContaining({
        accessToken: 'refreshed-access-token',
        refreshToken: 'stored-refresh-token',
        tokenType: 'Bearer',
      }),
      'stored-client-id',
      'https://auth.example.com/token',
      'https://example.com/mcp',
    );
  });

  it('does not preserve a stale expiresAt when refreshed tokens omit expires_in', async () => {
    const expiredCredentials: OAuthCredentials = {
      ...storedCredentials,
      token: {
        ...storedCredentials.token,
        expiresAt: Date.now() - 60_000,
      },
    };

    vi.mocked(tokenStorage.getCredentials)
      .mockResolvedValueOnce(expiredCredentials)
      .mockResolvedValueOnce({
        ...expiredCredentials,
        token: {
          accessToken: 'refreshed-access-token',
          refreshToken: 'stored-refresh-token',
          tokenType: 'Bearer',
          scope: 'scope-a scope-b',
        },
      });

    const provider = new StoredOAuthMcpProvider(
      'test-server',
      oauthConfig,
      tokenStorage,
    );

    await provider.saveTokens({
      access_token: 'refreshed-access-token',
      token_type: 'Bearer',
    });

    expect(tokenStorage.saveToken).toHaveBeenCalledWith(
      'test-server',
      expect.not.objectContaining({
        expiresAt: expect.any(Number),
      }),
      'stored-client-id',
      'https://auth.example.com/token',
      'https://example.com/mcp',
    );
  });

  it('invalidates stored credentials', async () => {
    const provider = new StoredOAuthMcpProvider(
      'test-server',
      oauthConfig,
      tokenStorage,
    );

    await provider.invalidateCredentials('tokens');

    expect(tokenStorage.deleteCredentials).toHaveBeenCalledWith('test-server');
  });
});
