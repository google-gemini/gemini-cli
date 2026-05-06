/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenIdConnectAuthProvider } from './openIdConnect-provider.js';
import { MCPOAuthTokenStorage } from '../../mcp/oauth-token-storage.js';
import { Storage } from '../../config/storage.js';

// Mock HybridTokenStorage first because it's used in the static graph of other files
vi.mock('../../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn().mockImplementation(() => ({
    listServers: vi.fn(),
    setCredentials: vi.fn(),
    getCredentials: vi.fn(),
    deleteCredentials: vi.fn(),
  })),
}));

vi.mock('../../mcp/oauth-token-storage.js');
vi.mock('../../config/storage.js');
vi.mock('../../utils/oauth-flow.js');
vi.mock('../../utils/secure-browser-launcher.js');
vi.mock('../../utils/authConsent.js');

interface MockDiscoveryResponse {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

describe('OpenIdConnectAuthProvider', () => {
  const mockConfig = {
    type: 'openIdConnect' as const,
    issuer_url: 'https://example.com/auth',
    client_id: 'test-client-id',
  };
  const agentName = 'test-agent';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(Storage.getA2AOAuthTokensPath).mockReturnValue('/mock/path');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should discover endpoints and create instance during factory creation', async () => {
    const mockDiscoveryResponse: MockDiscoveryResponse = {
      authorization_endpoint: 'https://example.com/auth/authorize',
      token_endpoint: 'https://example.com/auth/token',
      jwks_uri: 'https://example.com/auth/jwks',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDiscoveryResponse,
    } as Response);

    // Mock token storage instance
    const mockStorage = {
      getCredentials: vi.fn().mockResolvedValue(null),
      isTokenExpired: vi.fn().mockReturnValue(false),
    };
    vi.mocked(MCPOAuthTokenStorage).mockImplementation(
      () => mockStorage as unknown as MCPOAuthTokenStorage,
    );

    const provider = await OpenIdConnectAuthProvider.create(
      mockConfig,
      agentName,
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/auth/.well-known/openid-configuration',
    );
    expect(provider).toBeInstanceOf(OpenIdConnectAuthProvider);
  });

  it('should initialize from cache when valid token is present', async () => {
    const mockDiscoveryResponse: MockDiscoveryResponse = {
      authorization_endpoint: 'https://example.com/auth/authorize',
      token_endpoint: 'https://example.com/auth/token',
      jwks_uri: 'https://example.com/auth/jwks',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDiscoveryResponse,
    } as Response);

    const validToken = {
      accessToken: 'valid-access-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
    };

    // Mock token storage instance to return a valid token
    const mockStorage = {
      getCredentials: vi.fn().mockResolvedValue({ token: validToken }),
      isTokenExpired: vi.fn().mockReturnValue(false),
    };
    vi.mocked(MCPOAuthTokenStorage).mockImplementation(
      () => mockStorage as unknown as MCPOAuthTokenStorage,
    );

    const provider = await OpenIdConnectAuthProvider.create(
      mockConfig,
      agentName,
    );

    const headers = await provider.headers();
    expect(headers).toEqual({ Authorization: 'Bearer valid-access-token' });
    expect(mockStorage.getCredentials).toHaveBeenCalledWith(agentName);
  });

  it('should throw if issuer_url is not HTTPS', async () => {
    const insecureConfig = { ...mockConfig, issuer_url: 'http://insecure.com' };
    await expect(
      OpenIdConnectAuthProvider.create(insecureConfig, agentName),
    ).rejects.toThrow('OIDC issuer_url must use HTTPS');
  });

  it('should throw if discovered endpoints are not HTTPS', async () => {
    const mockInsecureDiscovery = {
      authorization_endpoint: 'http://example.com/auth/authorize',
      token_endpoint: 'https://example.com/auth/token',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockInsecureDiscovery,
    } as Response);

    await expect(
      OpenIdConnectAuthProvider.create(mockConfig, agentName),
    ).rejects.toThrow('OIDC discovery returned non-HTTPS endpoints');
  });
});
