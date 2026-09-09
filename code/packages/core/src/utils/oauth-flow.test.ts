/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as dnsPromises from 'node:dns/promises';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';
import type {
  OAuthFlowConfig,
  OAuthRefreshConfig,
  PKCEParams,
} from './oauth-flow.js';
import {
  generatePKCEParams,
  getPortFromUrl,
  buildAuthorizationUrl,
  startCallbackServer,
  exchangeCodeForToken,
  refreshAccessToken,
  areIssuersEqual,
  REDIRECT_PATH,
} from './oauth-flow.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// Save real fetch for startCallbackServer tests (which hit a real local server)
const realFetch = global.fetch;

// Mock fetch globally for token exchange/refresh tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Helper to create a mock Response object.
 */
function createMockResponse(
  body: string,
  options: { status?: number; contentType?: string } = {},
): Response {
  const { status = 200, contentType = 'application/json' } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: new Headers({ 'content-type': contentType }),
  } as Response;
}

const baseConfig: OAuthFlowConfig = {
  clientId: 'test-client-id',
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
};

const basePkceParams: PKCEParams = {
  codeVerifier: 'test-verifier',
  codeChallenge: 'test-challenge',
  state: 'test-state',
};

describe('oauth-flow', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_CALLBACK_PORT', '');
    mockFetch.mockReset();

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('areIssuersEqual', () => {
    it('should return true for identical issuer strings', () => {
      expect(
        areIssuersEqual(
          'https://github.com/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(true);
    });

    it('should return true when one issuer has a trailing slash', () => {
      expect(
        areIssuersEqual(
          'https://github.com/login/oauth/',
          'https://github.com/login/oauth',
        ),
      ).toBe(true);
      expect(
        areIssuersEqual(
          'https://github.com/login/oauth',
          'https://github.com/login/oauth/',
        ),
      ).toBe(true);
      expect(
        areIssuersEqual(
          'https://auth.example.com/',
          'https://auth.example.com',
        ),
      ).toBe(true);
    });

    it('should return false for different domains', () => {
      expect(
        areIssuersEqual(
          'https://attacker.example.com',
          'https://github.com/login/oauth',
        ),
      ).toBe(false);
    });

    it('should return false for different paths', () => {
      expect(
        areIssuersEqual(
          'https://auth.example.com/realm-a',
          'https://auth.example.com/realm-b',
        ),
      ).toBe(false);
    });

    it('should reject issuers containing userinfo to prevent mix-up attacks (RFC 9207 bypass)', () => {
      expect(
        areIssuersEqual(
          'https://github.com/login/oauth',
          'https://attacker.com@github.com/login/oauth',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://attacker.com@github.com/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://github.com@attacker.com/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://user:password@github.com/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://attacker.com@github.com/login/oauth',
          'https://attacker.com@github.com/login/oauth',
        ),
      ).toBe(false);
    });

    it('should distinguish issuers with different query parameters to prevent multi-tenant mix-up', () => {
      expect(
        areIssuersEqual(
          'https://auth.example.com?tenant=tenant1',
          'https://auth.example.com?tenant=tenant2',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://auth.example.com?tenant=tenant1',
          'https://auth.example.com',
        ),
      ).toBe(false);
      expect(
        areIssuersEqual(
          'https://auth.example.com/oauth/?tenant=tenant1',
          'https://auth.example.com/oauth?tenant=tenant1',
        ),
      ).toBe(true);
    });

    it('should distinguish issuers with different hash fragments', () => {
      expect(
        areIssuersEqual(
          'https://auth.example.com#env1',
          'https://auth.example.com#env2',
        ),
      ).toBe(false);
    });

    it('should normalize host casing and default ports', () => {
      expect(
        areIssuersEqual(
          'HTTPS://GITHUB.COM/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(true);
      expect(
        areIssuersEqual(
          'https://github.com:443/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(true);
      expect(
        areIssuersEqual(
          'https://github.com:8443/login/oauth',
          'https://github.com/login/oauth',
        ),
      ).toBe(false);
    });

    it('should handle non-URL strings gracefully', () => {
      expect(areIssuersEqual('custom-issuer', 'custom-issuer')).toBe(true);
      expect(areIssuersEqual('custom-issuer/', 'custom-issuer')).toBe(true);
      expect(areIssuersEqual('custom-issuer-a', 'custom-issuer-b')).toBe(false);
    });
  });

  describe('generatePKCEParams', () => {
    it('should return codeVerifier, codeChallenge, and state', () => {
      const params = generatePKCEParams();
      expect(params).toHaveProperty('codeVerifier');
      expect(params).toHaveProperty('codeChallenge');
      expect(params).toHaveProperty('state');
    });

    it('should generate a code verifier of at least 43 characters', () => {
      const params = generatePKCEParams();
      expect(params.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    it('should generate unique values on each call', () => {
      const params1 = generatePKCEParams();
      const params2 = generatePKCEParams();
      expect(params1.codeVerifier).not.toBe(params2.codeVerifier);
      expect(params1.state).not.toBe(params2.state);
    });

    it('should generate base64url-encoded values', () => {
      const params = generatePKCEParams();
      const base64urlRegex = /^[A-Za-z0-9_-]+$/;
      expect(params.codeVerifier).toMatch(base64urlRegex);
      expect(params.codeChallenge).toMatch(base64urlRegex);
      expect(params.state).toMatch(base64urlRegex);
    });
  });

  describe('getPortFromUrl', () => {
    it('should return undefined for undefined input', () => {
      expect(getPortFromUrl(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(getPortFromUrl('')).toBeUndefined();
    });

    it('should return undefined for invalid URL', () => {
      expect(getPortFromUrl('not-a-url')).toBeUndefined();
    });

    it('should return the port number from a URL with an explicit port', () => {
      expect(getPortFromUrl('http://localhost:8080/callback')).toBe(8080);
    });

    it('should return undefined for a URL without an explicit port', () => {
      expect(getPortFromUrl('https://example.com/callback')).toBeUndefined();
    });

    it('should return port for edge case port 1', () => {
      expect(getPortFromUrl('http://localhost:1')).toBe(1);
    });

    it('should return port for edge case port 65535', () => {
      expect(getPortFromUrl('http://localhost:65535')).toBe(65535);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('should build a valid authorization URL with required parameters', () => {
      const url = buildAuthorizationUrl(baseConfig, basePkceParams, 3000);
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://auth.example.com');
      expect(parsed.pathname).toBe('/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('state')).toBe('test-state');
      expect(parsed.searchParams.get('code_challenge')).toBe('test-challenge');
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('should use the default redirect URI based on port', () => {
      const url = buildAuthorizationUrl(baseConfig, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        `http://localhost:3000${REDIRECT_PATH}`,
      );
    });

    it('should use a custom redirectUri from config when provided', () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'https://custom.example.com/callback',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://custom.example.com/callback',
      );
    });

    it('should include scopes when provided', () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        scopes: ['read', 'write'],
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('scope')).toBe('read write');
    });

    it('should not include scope param when scopes array is empty', () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        scopes: [],
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.has('scope')).toBe(false);
    });

    it('should include audiences when provided', () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        audiences: ['https://api.example.com'],
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('audience')).toBe(
        'https://api.example.com',
      );
    });

    it('should include resource parameter when provided', () => {
      const url = buildAuthorizationUrl(
        baseConfig,
        basePkceParams,
        3000,
        'https://mcp.example.com',
      );
      const parsed = new URL(url);
      expect(parsed.searchParams.get('resource')).toBe(
        'https://mcp.example.com',
      );
    });

    it('should not include resource parameter when not provided', () => {
      const url = buildAuthorizationUrl(baseConfig, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.has('resource')).toBe(false);
    });

    it('should use the Cloud Workstations proxy callback URL when running inside Cloud Workstations', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const url = buildAuthorizationUrl(baseConfig, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        `https://3000-my-workstation.cluster.workstations.cloud.google.com${REDIRECT_PATH}`,
      );
    });

    it('should convert explicitly configured localhost URL to Workstations proxy URL', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'http://localhost:8080/custom/callback',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://3000-my-workstation.cluster.workstations.cloud.google.com/custom/callback',
      );
    });

    it('should convert explicitly configured 127.0.0.1 URL to Workstations proxy URL', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'http://127.0.0.1:4000/oauth2callback',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://3000-my-workstation.cluster.workstations.cloud.google.com/oauth2callback',
      );
    });

    it('should convert explicitly configured [::1] IPv6 loopback URL to Workstations proxy URL', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'http://[::1]:9090/oauth2callback',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://3000-my-workstation.cluster.workstations.cloud.google.com/oauth2callback',
      );
    });

    it('should preserve query parameters and hashes from the configured redirectUri', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'http://localhost:5050/callback?tenant=123#token=abc',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://3000-my-workstation.cluster.workstations.cloud.google.com/callback?tenant=123#token=abc',
      );
    });

    it('should leave external explicitly configured redirect URIs untouched under Cloud Workstations', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'https://external-domain.com/callback',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://external-domain.com/callback',
      );
    });

    it('should handle invalid redirect URIs gracefully by returning them as-is', () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'not-a-valid-url',
      };
      const url = buildAuthorizationUrl(config, basePkceParams, 3000);
      const parsed = new URL(url);
      expect(parsed.searchParams.get('redirect_uri')).toBe('not-a-valid-url');
    });
  });

  describe('startCallbackServer', () => {
    it('should start a server and resolve port', async () => {
      const server = startCallbackServer('test-state');
      const port = await server.port;
      expect(port).toBeGreaterThan(0);

      // Make a successful callback request to close the server
      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=abc&state=test-state`,
      );
      expect(res.status).toBe(200);
      await server.response;
    });

    it('should resolve response with code and state on valid callback', async () => {
      const server = startCallbackServer('my-state');
      const port = await server.port;

      await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=auth-code-123&state=my-state`,
      );

      const response = await server.response;
      expect(response.code).toBe('auth-code-123');
      expect(response.state).toBe('my-state');
    });

    it('should resolve response with code, state, and matching iss on valid callback', async () => {
      const server = startCallbackServer(
        'my-state',
        undefined,
        'https://github.com/login/oauth',
      );
      const port = await server.port;

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=auth-code-123&state=my-state&iss=https://github.com/login/oauth`,
      );
      expect(res.status).toBe(200);

      const response = await server.response;
      expect(response.code).toBe('auth-code-123');
      expect(response.state).toBe('my-state');
      expect(response.iss).toBe('https://github.com/login/oauth');
    });

    it('should accept callback when issuer matches with trailing slash normalization', async () => {
      const server = startCallbackServer(
        'my-state',
        undefined,
        'https://github.com/login/oauth/',
      );
      const port = await server.port;

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=auth-code-123&state=my-state&iss=https://github.com/login/oauth`,
      );
      expect(res.status).toBe(200);

      const response = await server.response;
      expect(response.code).toBe('auth-code-123');
      expect(response.state).toBe('my-state');
    });

    it('should reject callback when expectedIssuer is configured but iss parameter is omitted (downgrade prevention)', async () => {
      const server = startCallbackServer(
        'my-state',
        undefined,
        'https://secure-idp.example.com',
      );
      const port = await server.port;

      const responseResult = server.response.then(
        () => new Error('Expected rejection'),
        (e: Error) => e,
      );

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=auth-code-123&state=my-state`,
      ).catch(() => {});

      if (res) {
        expect(res.status).toBe(400);
      }

      const error = await responseResult;
      expect(error.message).toContain(
        'Missing "iss" parameter in authorization response per RFC 9207',
      );
      // Ensure sensitive internal issuer details are not exposed in the error message
      expect(error.message).not.toContain('https://secure-idp.example.com');
    });

    it('should allow callback when no expectedIssuer is configured and iss parameter is omitted', async () => {
      const server = startCallbackServer('my-state', undefined, undefined);
      const port = await server.port;

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=legacy-code&state=my-state`,
      );
      expect(res.status).toBe(200);

      const response = await server.response;
      expect(response.code).toBe('legacy-code');
      expect(response.state).toBe('my-state');
      expect(response.iss).toBeUndefined();
    });

    it('should allow callback when no expectedIssuer is configured and iss parameter is present', async () => {
      const server = startCallbackServer('my-state', undefined, undefined);
      const port = await server.port;

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=code-456&state=my-state&iss=https://idp.example.com`,
      );
      expect(res.status).toBe(200);

      const response = await server.response;
      expect(response.code).toBe('code-456');
      expect(response.state).toBe('my-state');
      expect(response.iss).toBe('https://idp.example.com');
    });

    it('should reject on state mismatch', async () => {
      const server = startCallbackServer('expected-state');
      const port = await server.port;

      // Attach rejection handler BEFORE triggering the callback to prevent
      // unhandled rejection race with Vitest's detection.
      const responseResult = server.response.then(
        () => new Error('Expected rejection'),
        (e: Error) => e,
      );

      await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=abc&state=wrong-state`,
      ).catch(() => {
        // Connection may be reset by server closing — expected
      });

      const error = await responseResult;
      expect(error.message).toContain('State mismatch - possible CSRF attack');
    });

    it('should reject callback when issuer (iss) does not match expected authorization server', async () => {
      const server = startCallbackServer(
        'expected-state',
        undefined,
        'https://github.com/login/oauth',
      );
      const port = await server.port;

      const responseResult = server.response.then(
        () => new Error('Expected rejection'),
        (e: Error) => e,
      );

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=abc&state=expected-state&iss=https://attacker-idp.example.com`,
      ).catch(() => {});

      if (res) {
        expect(res.status).toBe(400);
      }

      const error = await responseResult;
      expect(error.message).toContain('Issuer mismatch');
      expect(error.message).not.toContain('https://attacker-idp.example.com');
      expect(error.message).not.toContain('https://github.com/login/oauth');
    });

    it('should reject callback when issuer contains userinfo spoofing attempt', async () => {
      const server = startCallbackServer(
        'expected-state',
        undefined,
        'https://github.com/login/oauth',
      );
      const port = await server.port;

      const responseResult = server.response.then(
        () => new Error('Expected rejection'),
        (e: Error) => e,
      );

      const res = await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=abc&state=expected-state&iss=https://attacker.com@github.com/login/oauth`,
      ).catch(() => {});

      if (res) {
        expect(res.status).toBe(400);
      }

      const error = await responseResult;
      expect(error.message).toContain('Issuer mismatch');
      expect(error.message).not.toContain('https://attacker.com');
      expect(error.message).not.toContain('https://github.com/login/oauth');
    });

    it('should reject on OAuth error in callback', async () => {
      const server = startCallbackServer('test-state');
      const port = await server.port;

      // Attach rejection handler BEFORE triggering the callback
      const responseResult = server.response.then(
        () => new Error('Expected rejection'),
        (e: Error) => e,
      );

      await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?error=access_denied&error_description=User+denied`,
      ).catch(() => {
        // Connection may be reset by server closing — expected
      });

      const error = await responseResult;
      expect(error.message).toContain('OAuth error: access_denied');
    });

    it('should return 404 for non-callback paths', async () => {
      const server = startCallbackServer('test-state');
      const port = await server.port;

      const res = await realFetch(`http://localhost:${port}/other-path`);
      expect(res.status).toBe(404);

      // Clean up: send valid callback to close the server
      await realFetch(
        `http://localhost:${port}${REDIRECT_PATH}?code=abc&state=test-state`,
      );
      await server.response;
    });

    it('should reject when OAUTH_CALLBACK_PORT env var is invalid', async () => {
      vi.stubEnv('OAUTH_CALLBACK_PORT', 'not-a-number');

      const server = startCallbackServer('test-state');

      await expect(server.port).rejects.toThrow(
        'Invalid value for OAUTH_CALLBACK_PORT',
      );
      await expect(server.response).rejects.toThrow(
        'Invalid value for OAUTH_CALLBACK_PORT',
      );
    });

    it('should settle on timeout without keeping the process alive', async () => {
      vi.useFakeTimers();
      try {
        const server = startCallbackServer('timeout-state');
        await server.port;

        const responsePromise = server.response.catch((e: Error) => {
          if (e.message !== 'OAuth callback timeout') throw e;
          return e;
        });

        // Advance timers by 5 minutes to trigger the timeout
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        const error = await responsePromise;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('OAuth callback timeout');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token with JSON response', async () => {
      const tokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(JSON.stringify(tokenResponse)),
      );

      const result = await exchangeCodeForToken(
        baseConfig,
        'auth-code',
        'code-verifier',
        3000,
      );

      expect(result.access_token).toBe('test-access-token');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(3600);
      expect(result.refresh_token).toBe('test-refresh-token');
    });

    it('should send correct parameters in the request body', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await exchangeCodeForToken(baseConfig, 'my-code', 'my-verifier', 4000);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://auth.example.com/token');
      const body = new URLSearchParams(options.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('my-code');
      expect(body.get('code_verifier')).toBe('my-verifier');
      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('redirect_uri')).toBe(
        `http://localhost:4000${REDIRECT_PATH}`,
      );
    });

    it('should include client_secret when provided', async () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        clientSecret: 'my-secret',
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await exchangeCodeForToken(config, 'code', 'verifier', 3000);

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('client_secret')).toBe('my-secret');
    });

    it('should include resource parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await exchangeCodeForToken(
        baseConfig,
        'code',
        'verifier',
        3000,
        'https://mcp.example.com',
      );

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('resource')).toBe('https://mcp.example.com');
    });

    it('should handle form-urlencoded token response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          'access_token=form-token&token_type=Bearer&expires_in=7200',
          { contentType: 'application/x-www-form-urlencoded' },
        ),
      );

      const result = await exchangeCodeForToken(
        baseConfig,
        'code',
        'verifier',
        3000,
      );

      expect(result.access_token).toBe('form-token');
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(7200);
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse('Bad request', { status: 400 }),
      );

      await expect(
        exchangeCodeForToken(baseConfig, 'code', 'verifier', 3000),
      ).rejects.toThrow('Token exchange failed');
    });

    it('should throw on non-ok response with form-urlencoded error', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          'error=invalid_grant&error_description=Code+expired',
          {
            status: 400,
            contentType: 'application/x-www-form-urlencoded',
          },
        ),
      );

      await expect(
        exchangeCodeForToken(baseConfig, 'code', 'verifier', 3000),
      ).rejects.toThrow('invalid_grant');
    });

    it('should throw when JSON response has no access_token and form-urlencoded fallback also fails', async () => {
      // JSON that parses but has no access_token — falls through to form-urlencoded
      // which also has no access_token
      mockFetch.mockResolvedValueOnce(
        createMockResponse(JSON.stringify({ error: 'server_error' })),
      );

      await expect(
        exchangeCodeForToken(baseConfig, 'code', 'verifier', 3000),
      ).rejects.toThrow('Token exchange failed');
    });

    it('should use custom redirectUri from config', async () => {
      const config: OAuthFlowConfig = {
        ...baseConfig,
        redirectUri: 'https://custom.example.com/cb',
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await exchangeCodeForToken(config, 'code', 'verifier', 3000);

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('redirect_uri')).toBe('https://custom.example.com/cb');
    });

    it('should use the Cloud Workstations proxy callback URL when running inside Cloud Workstations', async () => {
      vi.stubEnv('GOOGLE_CLOUD_WORKSTATIONS', 'true');
      vi.stubEnv(
        'WEB_HOST',
        'my-workstation.cluster.workstations.cloud.google.com',
      );

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await exchangeCodeForToken(baseConfig, 'code', 'verifier', 3000);

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('redirect_uri')).toBe(
        `https://3000-my-workstation.cluster.workstations.cloud.google.com${REDIRECT_PATH}`,
      );
    });

    it('should default token_type to Bearer when missing from JSON response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(JSON.stringify({ access_token: 'tok' })),
      );

      const result = await exchangeCodeForToken(
        baseConfig,
        'code',
        'verifier',
        3000,
      );
      expect(result.token_type).toBe('Bearer');
    });
  });

  describe('refreshAccessToken', () => {
    const refreshConfig: OAuthRefreshConfig = {
      clientId: 'test-client-id',
    };

    it('should refresh a token with JSON response', async () => {
      const tokenResponse = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(JSON.stringify(tokenResponse)),
      );

      const result = await refreshAccessToken(
        refreshConfig,
        'old-refresh-token',
        'https://auth.example.com/token',
      );

      expect(result.access_token).toBe('new-access-token');
      expect(result.expires_in).toBe(3600);
    });

    it('should send correct parameters in the request body', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await refreshAccessToken(
        refreshConfig,
        'my-refresh-token',
        'https://auth.example.com/token',
      );

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('my-refresh-token');
      expect(body.get('client_id')).toBe('test-client-id');
    });

    it('should include client_secret when provided', async () => {
      const config: OAuthRefreshConfig = {
        ...refreshConfig,
        clientSecret: 'secret',
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await refreshAccessToken(
        config,
        'refresh-token',
        'https://auth.example.com/token',
      );

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('client_secret')).toBe('secret');
    });

    it('should include scopes and audiences when provided', async () => {
      const config: OAuthRefreshConfig = {
        ...refreshConfig,
        scopes: ['read', 'write'],
        audiences: ['https://api.example.com'],
      };
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await refreshAccessToken(
        config,
        'refresh-token',
        'https://auth.example.com/token',
      );

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('scope')).toBe('read write');
      expect(body.get('audience')).toBe('https://api.example.com');
    });

    it('should include resource parameter when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }),
        ),
      );

      await refreshAccessToken(
        refreshConfig,
        'refresh-token',
        'https://auth.example.com/token',
        'https://mcp.example.com',
      );

      const body = new URLSearchParams(
        (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string,
      );
      expect(body.get('resource')).toBe('https://mcp.example.com');
    });

    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse('Unauthorized', { status: 401 }),
      );

      await expect(
        refreshAccessToken(
          refreshConfig,
          'bad-token',
          'https://auth.example.com/token',
        ),
      ).rejects.toThrow('Token refresh failed');
    });

    it('should handle form-urlencoded token response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          'access_token=refreshed-token&token_type=Bearer&expires_in=1800',
          { contentType: 'application/x-www-form-urlencoded' },
        ),
      );

      const result = await refreshAccessToken(
        refreshConfig,
        'refresh-token',
        'https://auth.example.com/token',
      );

      expect(result.access_token).toBe('refreshed-token');
      expect(result.expires_in).toBe(1800);
    });

    it('should reject token refresh when tokenUrl points to private IP or loopback from remote', async () => {
      await expect(
        refreshAccessToken(
          refreshConfig,
          'refresh-token',
          'http://127.0.0.1:18080/token',
          'https://mcp.remote.com',
        ),
      ).rejects.toThrow();

      await expect(
        refreshAccessToken(
          refreshConfig,
          'refresh-token',
          'http://169.254.169.254/token',
        ),
      ).rejects.toThrow();
    });

    it('should reject token exchange when tokenUrl points to private IP or loopback from remote', async () => {
      await expect(
        exchangeCodeForToken(
          {
            ...baseConfig,
            tokenUrl: 'http://127.0.0.1:18080/token',
          },
          'code',
          'verifier',
          3000,
          'https://mcp.remote.com',
        ),
      ).rejects.toThrow();

      await expect(
        exchangeCodeForToken(
          {
            ...baseConfig,
            tokenUrl: 'http://169.254.169.254/token',
          },
          'code',
          'verifier',
          3000,
        ),
      ).rejects.toThrow();
    });
  });
});
