/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

// Mock dependencies AT THE TOP
const mockOpenBrowserSecurely = vi.hoisted(() => vi.fn());
vi.mock('../utils/secure-browser-launcher.js', () => ({
  openBrowserSecurely: mockOpenBrowserSecurely,
}));
vi.mock('node:crypto');
vi.mock('./oauth-token-storage.js', () => {
  const mockSaveToken = vi.fn();
  const mockGetCredentials = vi.fn();
  const mockIsTokenExpired = vi.fn();
  const mockdeleteCredentials = vi.fn();

  return {
    MCPOAuthTokenStorage: vi.fn(() => ({
      saveToken: mockSaveToken,
      getCredentials: mockGetCredentials,
      isTokenExpired: mockIsTokenExpired,
      deleteCredentials: mockdeleteCredentials,
    })),
  };
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import type {
  MCPOAuthConfig,
  OAuthTokenResponse,
  OAuthClientRegistrationResponse,
} from './oauth-provider.js';
import { MCPOAuthProvider } from './oauth-provider.js';
import type { OAuthToken } from './token-storage/types.js';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import type {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './oauth-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper function to create mock fetch responses with proper headers
const createMockResponse = (options: {
  ok: boolean;
  status?: number;
  contentType?: string;
  text?: string | (() => Promise<string>);
  json?: unknown | (() => Promise<unknown>);
}) => {
  const response: {
    ok: boolean;
    status?: number;
    headers: {
      get: (name: string) => string | null;
    };
    text?: () => Promise<string>;
    json?: () => Promise<unknown>;
  } = {
    ok: options.ok,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') {
          return options.contentType || null;
        }
        return null;
      },
    },
  };

  if (options.status !== undefined) {
    response.status = options.status;
  }

  if (options.text !== undefined) {
    response.text =
      typeof options.text === 'string'
        ? () => Promise.resolve(options.text as string)
        : (options.text as () => Promise<string>);
  }

  if (options.json !== undefined) {
    response.json =
      typeof options.json === 'function'
        ? (options.json as () => Promise<unknown>)
        : () => Promise.resolve(options.json);
  }

  return response;
};

// Define a reusable mock server with .listen, .close, and .on methods
const mockHttpServer = {
  listen: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
};
vi.mock('node:http', () => ({
  createServer: vi.fn(() => mockHttpServer),
}));

describe('MCPOAuthProvider', () => {
  const mockConfig: MCPOAuthConfig = {
    enabled: true,
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['read', 'write'],
    redirectUri: 'http://localhost:7777/oauth/callback',
    audiences: ['https://api.example.com'],
  };

  const mockToken: OAuthToken = {
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    tokenType: 'Bearer',
    scope: 'read write',
    expiresAt: Date.now() + 3600000,
  };

  const mockTokenResponse: OAuthTokenResponse = {
    access_token: 'access_token_123',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'refresh_token_456',
    scope: 'read write',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenBrowserSecurely.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock crypto functions
    vi.mocked(crypto.randomBytes).mockImplementation((size: number) => {
      if (size === 32) return Buffer.from('code_verifier_mock_32_bytes_long');
      if (size === 16) return Buffer.from('state_mock_16_by');
      return Buffer.alloc(size);
    });

    vi.mocked(crypto.createHash).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('code_challenge_mock'),
    } as unknown as crypto.Hash);

    // Mock randomBytes to return predictable values for state
    vi.mocked(crypto.randomBytes).mockImplementation((size) => {
      if (size === 32) {
        return Buffer.from('mock_code_verifier_32_bytes_long_string');
      } else if (size === 16) {
        return Buffer.from('mock_state_16_bytes');
      }
      return Buffer.alloc(size);
    });

    // Mock token storage
    const tokenStorage = new MCPOAuthTokenStorage();
    vi.mocked(tokenStorage.saveToken).mockResolvedValue(undefined);
    vi.mocked(tokenStorage.getCredentials).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should perform complete OAuth flow with PKCE', async () => {
      // Mock HTTP server callback
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        // Simulate OAuth callback
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      // Mock token exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.authenticate('test-server', mockConfig);

      expect(result).toEqual({
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        tokenType: 'Bearer',
        scope: 'read write',
        expiresAt: expect.any(Number),
      });

      expect(mockOpenBrowserSecurely).toHaveBeenCalledWith(
        expect.stringContaining('authorize'),
      );
      const tokenStorage = new MCPOAuthTokenStorage();
      expect(tokenStorage.saveToken).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({ accessToken: 'access_token_123' }),
        'test-client-id',
        'https://auth.example.com/token',
        undefined,
      );
    });

    it('should handle OAuth discovery when no authorization URL provided', async () => {
      // Use a mutable config object
      const configWithoutAuth: MCPOAuthConfig = {
        ...mockConfig,
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      };
      delete configWithoutAuth.authorizationUrl;
      delete configWithoutAuth.tokenUrl;

      const mockResourceMetadata = {
        authorization_servers: ['https://discovered.auth.com'],
      };

      const mockAuthServerMetadata = {
        authorization_endpoint: 'https://discovered.auth.com/authorize',
        token_endpoint: 'https://discovered.auth.com/token',
        scopes_supported: ['read', 'write'],
      };

      // Mock HEAD request for WWW-Authenticate check
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockResourceMetadata),
            json: mockResourceMetadata,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockAuthServerMetadata),
            json: mockAuthServerMetadata,
          }),
        );

      // Setup callback handler
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      // Mock token exchange with discovered endpoint
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.authenticate(
        'test-server',
        configWithoutAuth,
        'https://api.example.com',
      );

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discovered.auth.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        }),
      );
    });

    it('should perform dynamic client registration when no client ID is provided but registration URL is provided', async () => {
      const configWithoutClient: MCPOAuthConfig = {
        ...mockConfig,
        registrationUrl: 'https://auth.example.com/register',
      };
      delete configWithoutClient.clientId;

      const mockRegistrationResponse: OAuthClientRegistrationResponse = {
        client_id: 'dynamic_client_id',
        client_secret: 'dynamic_client_secret',
        redirect_uris: ['http://localhost:7777/oauth/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockRegistrationResponse),
          json: mockRegistrationResponse,
        }),
      );

      // Setup callback handler
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      // Mock token exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.authenticate(
        'test-server',
        configWithoutClient,
      );

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should perform OAuth discovery and dynamic client registration when no client ID or registration URL provided', async () => {
      const configWithoutClient: MCPOAuthConfig = { ...mockConfig };
      delete configWithoutClient.clientId;

      const mockRegistrationResponse: OAuthClientRegistrationResponse = {
        client_id: 'dynamic_client_id',
        client_secret: 'dynamic_client_secret',
        redirect_uris: ['http://localhost:7777/oauth/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };

      const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      };

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockAuthServerMetadata),
            json: mockAuthServerMetadata,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockRegistrationResponse),
            json: mockRegistrationResponse,
          }),
        );

      // Setup callback handler
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      // Mock token exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.authenticate(
        'test-server',
        configWithoutClient,
      );

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should perform OAuth discovery once and dynamic client registration when no client ID, authorization URL or registration URL provided', async () => {
      const configWithoutClientAndAuthorizationUrl: MCPOAuthConfig = {
        ...mockConfig,
      };
      delete configWithoutClientAndAuthorizationUrl.clientId;
      delete configWithoutClientAndAuthorizationUrl.authorizationUrl;

      const mockResourceMetadata: OAuthProtectedResourceMetadata = {
        resource: 'https://api.example.com',
        authorization_servers: ['https://auth.example.com'],
      };

      const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      };

      const mockRegistrationResponse: OAuthClientRegistrationResponse = {
        client_id: 'dynamic_client_id',
        client_secret: 'dynamic_client_secret',
        redirect_uris: ['http://localhost:7777/oauth/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      };

      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockResourceMetadata),
            json: mockResourceMetadata,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockAuthServerMetadata),
            json: mockAuthServerMetadata,
          }),
        )
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            contentType: 'application/json',
            text: JSON.stringify(mockRegistrationResponse),
            json: mockRegistrationResponse,
          }),
        );

      // Setup callback handler
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      // Mock token exchange
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.authenticate(
        'test-server',
        configWithoutClientAndAuthorizationUrl,
        'https://api.example.com',
      );

      expect(result).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should handle OAuth callback errors', async () => {
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?error=access_denied&error_description=User%20denied%20access',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      const authProvider = new MCPOAuthProvider();
      await expect(
        authProvider.authenticate('test-server', mockConfig),
      ).rejects.toThrow('OAuth error: access_denied');
    });

    it('should handle state mismatch in callback', async () => {
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=wrong_state',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      const authProvider = new MCPOAuthProvider();
      await expect(
        authProvider.authenticate('test-server', mockConfig),
      ).rejects.toThrow('State mismatch - possible CSRF attack');
    });

    it('should handle token exchange failure', async () => {
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
        }, 10);
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          contentType: 'application/x-www-form-urlencoded',
          text: 'error=invalid_grant&error_description=Invalid grant',
        }),
      );

      const authProvider = new MCPOAuthProvider();
      await expect(
        authProvider.authenticate('test-server', mockConfig),
      ).rejects.toThrow('Token exchange failed: invalid_grant - Invalid grant');
    });

    it('should handle callback timeout', async () => {
      vi.mocked(http.createServer).mockImplementation(
        () => mockHttpServer as unknown as http.Server,
      );

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        // Don't trigger callback - simulate timeout
      });

      // Mock setTimeout to trigger timeout immediately
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((callback, delay) => {
        if (delay === 5 * 60 * 1000) {
          // 5 minute timeout
          callback();
        }
        return originalSetTimeout(callback, 0);
      }) as unknown as typeof setTimeout;

      const authProvider = new MCPOAuthProvider();
      await expect(
        authProvider.authenticate('test-server', mockConfig),
      ).rejects.toThrow('OAuth callback timeout');

      global.setTimeout = originalSetTimeout;
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      const refreshResponse = {
        access_token: 'new_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new_refresh_token',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(refreshResponse),
          json: refreshResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.refreshAccessToken(
        mockConfig,
        'old_refresh_token',
        'https://auth.example.com/token',
      );

      expect(result).toEqual(refreshResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json, application/x-www-form-urlencoded',
          },
          body: expect.stringContaining('grant_type=refresh_token'),
        }),
      );
    });

    it('should include client secret in refresh request when available', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(mockTokenResponse),
          json: mockTokenResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      await authProvider.refreshAccessToken(
        mockConfig,
        'refresh_token',
        'https://auth.example.com/token',
      );

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body).toContain('client_secret=test-client-secret');
    });

    it('should handle refresh token failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          contentType: 'application/x-www-form-urlencoded',
          text: 'error=invalid_request&error_description=Invalid refresh token',
        }),
      );

      const authProvider = new MCPOAuthProvider();
      await expect(
        authProvider.refreshAccessToken(
          mockConfig,
          'invalid_refresh_token',
          'https://auth.example.com/token',
        ),
      ).rejects.toThrow(
        'Token refresh failed: invalid_request - Invalid refresh token',
      );
    });
  });

  describe('getValidToken', () => {
    it('should return valid token when not expired', async () => {
      const validCredentials = {
        serverName: 'test-server',
        token: mockToken,
        clientId: 'test-client-id',
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      const tokenStorage = new MCPOAuthTokenStorage();
      vi.mocked(tokenStorage.getCredentials).mockResolvedValue(
        validCredentials,
      );
      vi.mocked(tokenStorage.isTokenExpired).mockReturnValue(false);

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.getValidToken(
        'test-server',
        mockConfig,
      );

      expect(result).toBe('access_token_123');
    });

    it('should refresh expired token and return new token', async () => {
      const expiredCredentials = {
        serverName: 'test-server',
        token: { ...mockToken, expiresAt: Date.now() - 3600000 },
        clientId: 'test-client-id',
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      const tokenStorage = new MCPOAuthTokenStorage();
      vi.mocked(tokenStorage.getCredentials).mockResolvedValue(
        expiredCredentials,
      );
      vi.mocked(tokenStorage.isTokenExpired).mockReturnValue(true);

      const refreshResponse = {
        access_token: 'new_access_token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'new_refresh_token',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          contentType: 'application/json',
          text: JSON.stringify(refreshResponse),
          json: refreshResponse,
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.getValidToken(
        'test-server',
        mockConfig,
      );

      expect(result).toBe('new_access_token');
      expect(tokenStorage.saveToken).toHaveBeenCalledWith(
        'test-server',
        expect.objectContaining({ accessToken: 'new_access_token' }),
        'test-client-id',
        'https://auth.example.com/token',
        undefined,
      );
    });

    it('should return null when no credentials exist', async () => {
      const tokenStorage = new MCPOAuthTokenStorage();
      vi.mocked(tokenStorage.getCredentials).mockResolvedValue(null);

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.getValidToken(
        'test-server',
        mockConfig,
      );

      expect(result).toBeNull();
    });

    it('should handle refresh failure and remove invalid token', async () => {
      const expiredCredentials = {
        serverName: 'test-server',
        token: { ...mockToken, expiresAt: Date.now() - 3600000 },
        clientId: 'test-client-id',
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      const tokenStorage = new MCPOAuthTokenStorage();
      vi.mocked(tokenStorage.getCredentials).mockResolvedValue(
        expiredCredentials,
      );
      vi.mocked(tokenStorage.isTokenExpired).mockReturnValue(true);
      vi.mocked(tokenStorage.deleteCredentials).mockResolvedValue(undefined);

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          contentType: 'application/x-www-form-urlencoded',
          text: 'error=invalid_request&error_description=Invalid refresh token',
        }),
      );

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.getValidToken(
        'test-server',
        mockConfig,
      );

      expect(result).toBeNull();
      expect(tokenStorage.deleteCredentials).toHaveBeenCalledWith(
        'test-server',
      );
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to refresh token'),
      );
    });

    it('should return null for token without refresh capability', async () => {
      const tokenWithoutRefresh = {
        serverName: 'test-server',
        token: {
          ...mockToken,
          refreshToken: undefined,
          expiresAt: Date.now() - 3600000,
        },
        clientId: 'test-client-id',
        tokenUrl: 'https://auth.example.com/token',
        updatedAt: Date.now(),
      };

      const tokenStorage = new MCPOAuthTokenStorage();
      vi.mocked(tokenStorage.getCredentials).mockResolvedValue(
        tokenWithoutRefresh,
      );
      vi.mocked(tokenStorage.isTokenExpired).mockReturnValue(true);

      const authProvider = new MCPOAuthProvider();
      const result = await authProvider.getValidToken(
        'test-server',
        mockConfig,
      );

      expect(result).toBeNull();
    });
  });

  describe('PKCE parameter generation', () => {
    it('should generate valid PKCE parameters', async () => {
      // Test is implicit in the authenticate flow tests, but we can verify
      // the crypto mocks are called correctly
      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
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

      const authProvider = new MCPOAuthProvider();
      await authProvider.authenticate('test-server', mockConfig);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32); // code verifier
      expect(crypto.randomBytes).toHaveBeenCalledWith(16); // state
      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
    });
  });

  describe('Authorization URL building', () => {
    it('should build correct authorization URL with all parameters', async () => {
      // Mock to capture the URL that would be opened
      let capturedUrl: string | undefined;
      mockOpenBrowserSecurely.mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve();
      });

      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
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

      const authProvider = new MCPOAuthProvider();
      await authProvider.authenticate(
        'test-server',
        mockConfig,
        'https://auth.example.com',
      );

      expect(capturedUrl).toBeDefined();
      expect(capturedUrl!).toContain('response_type=code');
      expect(capturedUrl!).toContain('client_id=test-client-id');
      expect(capturedUrl!).toContain('code_challenge=code_challenge_mock');
      expect(capturedUrl!).toContain('code_challenge_method=S256');
      expect(capturedUrl!).toContain('scope=read+write');
      expect(capturedUrl!).toContain('resource=https%3A%2F%2Fauth.example.com');
      expect(capturedUrl!).toContain('audience=https%3A%2F%2Fapi.example.com');
    });

    it('should correctly append parameters to an authorization URL that already has query params', async () => {
      // Mock to capture the URL that would be opened
      let capturedUrl: string;
      mockOpenBrowserSecurely.mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve();
      });

      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
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

      const configWithParamsInUrl = {
        ...mockConfig,
        authorizationUrl: 'https://auth.example.com/authorize?audience=1234',
      };

      const authProvider = new MCPOAuthProvider();
      await authProvider.authenticate('test-server', configWithParamsInUrl);

      const url = new URL(capturedUrl!);
      expect(url.searchParams.get('audience')).toBe('1234');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.search.startsWith('?audience=1234&')).toBe(true);
    });

    it('should correctly append parameters to a URL with a fragment', async () => {
      // Mock to capture the URL that would be opened
      let capturedUrl: string;
      mockOpenBrowserSecurely.mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve();
      });

      let callbackHandler: unknown;
      vi.mocked(http.createServer).mockImplementation((handler) => {
        callbackHandler = handler;
        return mockHttpServer as unknown as http.Server;
      });

      mockHttpServer.listen.mockImplementation((port, callback) => {
        callback?.();
        setTimeout(() => {
          const mockReq = {
            url: '/oauth/callback?code=auth_code_123&state=bW9ja19zdGF0ZV8xNl9ieXRlcw',
          };
          const mockRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
          };
          (callbackHandler as (req: unknown, res: unknown) => void)(
            mockReq,
            mockRes,
          );
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

      const configWithFragment = {
        ...mockConfig,
        authorizationUrl: 'https://auth.example.com/authorize#login',
      };

      const authProvider = new MCPOAuthProvider();
      await authProvider.authenticate('test-server', configWithFragment);

      const url = new URL(capturedUrl!);
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.hash).toBe('#login');
      expect(url.pathname).toBe('/authorize');
    });
  });
});
