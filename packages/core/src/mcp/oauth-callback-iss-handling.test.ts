/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockOpenBrowserSecurely = vi.hoisted(() => vi.fn());
vi.mock('../utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: mockOpenBrowserSecurely,
}));
vi.mock('./oauth-token-storage.js', () => {
  const mockSaveToken = vi.fn();
  const mockGetCredentials = vi.fn();
  const mockIsTokenExpired = vi.fn();
  const mockDeleteCredentials = vi.fn();

  return {
    MCPOAuthTokenStorage: vi.fn(() => ({
      saveToken: mockSaveToken,
      getCredentials: mockGetCredentials,
      isTokenExpired: mockIsTokenExpired,
      deleteCredentials: mockDeleteCredentials,
    })),
  };
});
vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
    emitConsoleLog: vi.fn(),
  },
}));
vi.mock('../utils/authConsent.js', () => ({
  getConsentForOauth: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('../utils/headless.js', () => ({
  isHeadlessMode: vi.fn(() => false),
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import * as dnsPromises from 'node:dns/promises';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { MCPOAuthProvider } from './oauth-provider.js';
import type { MCPOAuthConfig } from './oauth-provider.js';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import { OAuthUtils } from './oauth-utils.js';
import type { OAuthAuthorizationServerMetadata } from './oauth-utils.js';
import { startCallbackServer, REDIRECT_PATH } from '../utils/oauth-flow.js';

const realFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch;

interface MockResponseOptions {
  ok: boolean;
  status?: number;
  contentType?: string;
  text?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

const createMockResponse = (options: MockResponseOptions): Response => {
  const status = options.status ?? (options.ok ? 200 : 400);
  const headers = new Headers(options.headers ?? {});
  if (options.contentType) {
    headers.set('content-type', options.contentType);
  }
  return {
    ok: options.ok,
    status,
    headers,
    text: () => Promise.resolve(options.text ?? ''),
    json: () => Promise.resolve(options.json ?? {}),
  } as Response;
};

describe('OAuth callback iss parameter handling (RFC 9207 & MCP Spec)', () => {
  const mcpServerUrl = 'https://mcp.notion.com/mcp';
  const expectedIssuer = 'https://mcp.notion.com';
  const mismatchIssuer = 'https://other-idp.example.com';

  const mockTokenResponse = {
    access_token: 'notion_access_token_123',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'notion_refresh_token_456',
    scope: 'read write',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenBrowserSecurely.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(
      dnsPromises.lookup as (
        hostname: string,
        options: LookupAllOptions,
      ) => Promise<LookupAddress[]>,
    ).mockImplementation(async (hostname: string) => {
      if (ipaddr.isValid(hostname)) {
        return [{ address: hostname, family: hostname.includes(':') ? 6 : 4 }];
      }
      return [{ address: '93.184.216.34', family: 4 }];
    });

    const tokenStorage = new MCPOAuthTokenStorage();
    vi.mocked(tokenStorage.saveToken).mockResolvedValue(undefined);
    vi.mocked(tokenStorage.getCredentials).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /**
   * Simulates the OAuth authorization server metadata discovery and browser
   * callback flow for an MCP server.
   */
  async function runOAuthFlowWithMetadata(
    metadataOverrides: Partial<OAuthAuthorizationServerMetadata>,
    callbackQueryParams: Record<string, string>,
  ) {
    const authServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: expectedIssuer,
      authorization_endpoint: `${expectedIssuer}/authorize`,
      token_endpoint: `${expectedIssuer}/token`,
      registration_endpoint: `${expectedIssuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      ...metadataOverrides,
    };

    const discoveredConfig =
      OAuthUtils.metadataToOAuthConfig(authServerMetadata);

    // Simulate mcp-client.ts constructing oauthAuthConfig from discoveredConfig
    const oauthAuthConfig: MCPOAuthConfig = {
      enabled: true,
      authorizationUrl: discoveredConfig.authorizationUrl,
      issuer: discoveredConfig.issuer,
      tokenUrl: discoveredConfig.tokenUrl,
      scopes: discoveredConfig.scopes || [],
      registrationUrl: discoveredConfig.registrationUrl,
      authorizationResponseIssParameterSupported:
        discoveredConfig.authorizationResponseIssParameterSupported,
      clientId: 'notion-dynamic-client-id',
    };

    mockOpenBrowserSecurely.mockImplementation(async (authUrlStr: string) => {
      const authUrl = new URL(authUrlStr);
      const redirectUri = authUrl.searchParams.get('redirect_uri')!;
      const state = authUrl.searchParams.get('state')!;

      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set('code', 'notion_auth_code_abc');
      callbackUrl.searchParams.set('state', state);
      for (const [key, value] of Object.entries(callbackQueryParams)) {
        callbackUrl.searchParams.set(key, value);
      }

      // Trigger the real local HTTP callback server asynchronously
      setTimeout(() => {
        realFetch(callbackUrl.toString()).catch(() => {});
      }, 10);
    });

    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        ok: true,
        contentType: 'application/json',
        text: JSON.stringify(mockTokenResponse),
        json: mockTokenResponse,
      }),
    );

    const authProvider = new MCPOAuthProvider(new MCPOAuthTokenStorage());
    return authProvider.authenticate('notion', oauthAuthConfig, mcpServerUrl);
  }

  it('T1: allows callback without iss when authorization_response_iss_parameter_supported is omitted in metadata (MCP Spec Row 4)', async () => {
    const token = await runOAuthFlowWithMetadata(
      {
        // Notion-style metadata: issuer is present, but authorization_response_iss_parameter_supported is omitted
      },
      {
        // Notion callback: returns code and state, omits iss
      },
    );

    expect(token.accessToken).toBe('notion_access_token_123');
  });

  it('T2: validates iss when authorization_response_iss_parameter_supported is true and iss is present (MCP Spec Row 1)', async () => {
    // Matching iss succeeds
    const token = await runOAuthFlowWithMetadata(
      {
        authorization_response_iss_parameter_supported: true,
      },
      {
        iss: expectedIssuer,
      },
    );
    expect(token.accessToken).toBe('notion_access_token_123');

    // Mismatched iss is rejected
    await expect(
      runOAuthFlowWithMetadata(
        {
          authorization_response_iss_parameter_supported: true,
        },
        {
          iss: mismatchIssuer,
        },
      ),
    ).rejects.toThrow(/Issuer mismatch in authorization response/);
  });

  it('T3: rejects callback without iss when authorization_response_iss_parameter_supported is true (MCP Spec Row 2)', async () => {
    await expect(
      runOAuthFlowWithMetadata(
        {
          authorization_response_iss_parameter_supported: true,
        },
        {
          // Callback omits iss even though server declared support
        },
      ),
    ).rejects.toThrow(
      'Missing "iss" parameter in authorization response per RFC 9207',
    );
  });

  it('T4: validates iss when present even if authorization_response_iss_parameter_supported is omitted or false (MCP Spec Row 3)', async () => {
    // Mismatched iss when authorization_response_iss_parameter_supported is omitted -> rejected
    await expect(
      runOAuthFlowWithMetadata(
        {},
        {
          iss: mismatchIssuer,
        },
      ),
    ).rejects.toThrow(/Issuer mismatch in authorization response/);

    // Mismatched iss when authorization_response_iss_parameter_supported is false -> rejected
    await expect(
      runOAuthFlowWithMetadata(
        {
          authorization_response_iss_parameter_supported: false,
        },
        {
          iss: mismatchIssuer,
        },
      ),
    ).rejects.toThrow(/Issuer mismatch in authorization response/);

    // Matching iss when authorization_response_iss_parameter_supported is omitted -> succeeds
    const token = await runOAuthFlowWithMetadata(
      {},
      {
        iss: expectedIssuer,
      },
    );
    expect(token.accessToken).toBe('notion_access_token_123');
  });

  it('T5: reproduces GH-29477 at startCallbackServer level when expectedIssuer is passed without requireIssInResponse', async () => {
    // When startCallbackServer is called with expectedIssuer but without requireIssInResponse=true,
    // a callback omitting iss (like Notion MCP) should resolve rather than reject.
    const server = startCallbackServer(
      'repro-state',
      undefined,
      expectedIssuer,
    );
    const port = await server.port;

    const responsePromise = server.response;
    const res = await realFetch(
      `http://localhost:${port}${REDIRECT_PATH}?code=notion-code-789&state=repro-state`,
    );

    expect(res.status).toBe(200);
    const authResponse = await responsePromise;
    expect(authResponse.code).toBe('notion-code-789');
    expect(authResponse.state).toBe('repro-state');
    expect(authResponse.iss).toBeUndefined();
  });
});
