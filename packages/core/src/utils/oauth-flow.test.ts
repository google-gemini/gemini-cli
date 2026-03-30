/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  REDIRECT_PATH,
} from './oauth-flow.js';

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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
  });
});
