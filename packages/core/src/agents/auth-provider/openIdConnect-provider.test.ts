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

  it('should discover endpoints during initialization', async () => {
    const mockDiscoveryResponse: MockDiscoveryResponse = {
      authorization_endpoint: 'https://example.com/auth/authorize',
      token_endpoint: 'https://example.com/auth/token',
      jwks_uri: 'https://example.com/auth/jwks',
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDiscoveryResponse,
    } as Response);

    const provider = new OpenIdConnectAuthProvider(mockConfig, agentName);

    // Mock token storage instance
    const mockStorage = {
      getCredentials: vi.fn().mockResolvedValue(null),
      isTokenExpired: vi.fn().mockReturnValue(false),
    };
    vi.mocked(MCPOAuthTokenStorage).mockImplementation(
      () => mockStorage as unknown as MCPOAuthTokenStorage,
    );

    await provider.initialize();

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/auth/.well-known/openid-configuration',
    );
    expect(MCPOAuthTokenStorage).toHaveBeenCalled();
  });

  it('should throw if discovery fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    } as Response);

    const provider = new OpenIdConnectAuthProvider(mockConfig, agentName);
    await expect(provider.initialize()).rejects.toThrow(
      'Discovery failed: Not Found',
    );
  });
});
