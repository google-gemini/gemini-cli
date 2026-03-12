/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OAuthUtils,
  type OAuthAuthorizationServerMetadata,
  type OAuthProtectedResourceMetadata,
} from './oauth-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuthUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildWellKnownUrls', () => {
    it('should build RFC 9728 compliant path-based URLs by default', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com/mcp');
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server/mcp',
      );
    });

    it('should build root-based URLs when useRootDiscovery is true', () => {
      const urls = OAuthUtils.buildWellKnownUrls(
        'https://example.com/mcp',
        true,
      );
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should handle root path correctly', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com');
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should handle trailing slash in path', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com/mcp/');
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server/mcp',
      );
    });

    it('should handle deep paths per RFC 9728', () => {
      const urls = OAuthUtils.buildWellKnownUrls(
        'https://app.mintmcp.com/s/g_2lj2CNDoJdf3xnbFeeF6vx/mcp',
      );
      expect(urls.protectedResource).toBe(
        'https://app.mintmcp.com/.well-known/oauth-protected-resource/s/g_2lj2CNDoJdf3xnbFeeF6vx/mcp',
      );
      expect(urls.authorizationServer).toBe(
        'https://app.mintmcp.com/.well-known/oauth-authorization-server/s/g_2lj2CNDoJdf3xnbFeeF6vx/mcp',
      );
    });
  });

  describe('fetchProtectedResourceMetadata', () => {
    const mockResourceMetadata: OAuthProtectedResourceMetadata = {
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
    };

    it('should fetch protected resource metadata successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResourceMetadata),
      });

      const result = await OAuthUtils.fetchProtectedResourceMetadata(
        'https://example.com/.well-known/oauth-protected-resource',
      );

      expect(result).toEqual(mockResourceMetadata);
    });

    it('should return null when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const result = await OAuthUtils.fetchProtectedResourceMetadata(
        'https://example.com/.well-known/oauth-protected-resource',
      );

      expect(result).toBeNull();
    });
  });

  describe('fetchAuthorizationServerMetadata', () => {
    const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      scopes_supported: ['read', 'write'],
    };

    it('should fetch authorization server metadata successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthServerMetadata),
      });

      const result = await OAuthUtils.fetchAuthorizationServerMetadata(
        'https://auth.example.com/.well-known/oauth-authorization-server',
      );

      expect(result).toEqual(mockAuthServerMetadata);
    });

    it('should return null when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const result = await OAuthUtils.fetchAuthorizationServerMetadata(
        'https://auth.example.com/.well-known/oauth-authorization-server',
      );

      expect(result).toBeNull();
    });
  });

  describe('discoverAuthorizationServerMetadata', () => {
    const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      scopes_supported: ['read', 'write'],
    };

    it('should handle URLs without path components correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await OAuthUtils.discoverAuthorizationServerMetadata(
        'https://auth.example.com/',
      );

      expect(result).toEqual(mockAuthServerMetadata);

      expect(mockFetch).nthCalledWith(
        1,
        'https://auth.example.com/.well-known/oauth-authorization-server',
      );
      expect(mockFetch).nthCalledWith(
        2,
        'https://auth.example.com/.well-known/openid-configuration',
      );
    });

    it('should handle URLs with path components correctly', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await OAuthUtils.discoverAuthorizationServerMetadata(
        'https://auth.example.com/mcp',
      );

      expect(result).toEqual(mockAuthServerMetadata);

      expect(mockFetch).nthCalledWith(
        1,
        'https://auth.example.com/.well-known/oauth-authorization-server/mcp',
      );
      expect(mockFetch).nthCalledWith(
        2,
        'https://auth.example.com/.well-known/openid-configuration/mcp',
      );
      expect(mockFetch).nthCalledWith(
        3,
        'https://auth.example.com/mcp/.well-known/openid-configuration',
      );
    });
  });

  describe('discoverOAuthConfig', () => {
    const mockResourceMetadata: OAuthProtectedResourceMetadata = {
      resource: 'https://example.com/mcp',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
    };

    const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      scopes_supported: ['read', 'write'],
    };

    it('should succeed when resource metadata matches server URL', async () => {
      mockFetch
        // fetchProtectedResourceMetadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        // discoverAuthorizationServerMetadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/mcp',
      );

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        issuer: 'https://auth.example.com',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
    });

    it('should throw error when resource metadata does not match server URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockResourceMetadata,
            resource: 'https://malicious.com/mcp',
          }),
      });

      await expect(
        OAuthUtils.discoverOAuthConfig('https://example.com/mcp'),
      ).rejects.toThrow(/does not match expected/);
    });

    it('should preserve registrationUrl for cross-subdomain auth server discovered via path-based URL', async () => {
      const serverUrl = 'https://example.com/v1/mcp';
      const resourceMetadata: OAuthProtectedResourceMetadata = {
        resource: 'https://example.com/v1/mcp',
        authorization_servers: ['https://oauth.example.com'],
      };
      const authServerMetadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://oauth.example.com',
        authorization_endpoint: 'https://oauth.example.com/authorize',
        token_endpoint: 'https://oauth.example.com/token',
        registration_endpoint: 'https://api.example.com/register',
        scopes_supported: ['read'],
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(resourceMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(authServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(serverUrl);

      expect(config?.registrationUrl).toBe('https://api.example.com/register');
      // Verify the path-based well-known URL was used for discovery
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/.well-known/oauth-protected-resource/v1/mcp',
      );
    });
  });

  describe('metadataToOAuthConfig', () => {
    it('should convert metadata to OAuth config', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        scopes_supported: ['read', 'write'],
      };

      const config = OAuthUtils.metadataToOAuthConfig(metadata);

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        issuer: 'https://auth.example.com',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
        registrationUrl: undefined,
      });
    });

    it('should handle empty scopes', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      };

      const config = OAuthUtils.metadataToOAuthConfig(metadata);

      expect(config).not.toBeNull();
      expect(config!.scopes).toEqual([]);
    });

    it('should use issuer from metadata', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
        token_endpoint: 'https://auth.example.com/token',
        scopes_supported: ['read', 'write'],
      };

      const config = OAuthUtils.metadataToOAuthConfig(metadata);

      expect(config).not.toBeNull();
      expect(config!.issuer).toBe('https://auth.example.com');
    });

    it('should include registrationUrl when endpoints share registrable domain with authServerUrl', () => {
      // Covers multi-subdomain deployments: discovery on one subdomain,
      // registration on a different subdomain of the same organization.
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://login.example.com',
        authorization_endpoint: 'https://login.example.com/authorize',
        token_endpoint: 'https://login.example.com/token',
        registration_endpoint: 'https://api.example.com/register',
      };

      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'https://auth.example.com',
      );

      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBe('https://api.example.com/register');
    });

    it('should exclude registrationUrl when registration endpoint domain differs from authServerUrl', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.trusted.com',
        authorization_endpoint: 'https://auth.trusted.com/authorize',
        token_endpoint: 'https://auth.trusted.com/token',
        registration_endpoint: 'https://evil.other.com/register',
      };

      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'https://auth.trusted.com',
      );

      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should return null for loopback-looking hostname that is not a true loopback address', () => {
      // 127.0.0.1.evil.com has 5 labels, so isIPv4() returns false.
      // It is not a loopback address, so HTTP is rejected.
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'http://127.0.0.1.evil.com',
        authorization_endpoint: 'http://127.0.0.1.evil.com/authorize',
        token_endpoint: 'http://127.0.0.1.evil.com/token',
      };
      expect(OAuthUtils.metadataToOAuthConfig(metadata)).toBeNull();
    });

    it('should allow http for loopback auth endpoints (local dev exemption)', () => {
      // RFC 8252 §8.3: loopback is treated as a secure context.
      // Realistic local-dev scenario: auth server runs on localhost without TLS.
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'http://localhost:8080',
        authorization_endpoint: 'http://localhost:8080/authorize',
        token_endpoint: 'http://localhost:8080/token',
        registration_endpoint: 'http://localhost:8080/register',
      };

      // authServerUrl is HTTP → registration_endpoint discarded, but the
      // authorization/token endpoints are still usable (loopback exemption).
      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'http://localhost:8080',
      );
      expect(config).not.toBeNull();
      expect(config!.authorizationUrl).toBe('http://localhost:8080/authorize');
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should return null when auth endpoints use http (non-loopback)', () => {
      // A private non-loopback IP address using HTTP is not a valid auth server.
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'http://192.168.1.1',
        authorization_endpoint: 'http://192.168.1.1/authorize',
        token_endpoint: 'http://192.168.1.1/token',
        registration_endpoint: 'http://192.168.1.1/register',
      };

      expect(
        OAuthUtils.metadataToOAuthConfig(metadata, 'https://auth.example.com'),
      ).toBeNull();
    });

    it('should return null when authorization_endpoint uses http (non-loopback)', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'http://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      };

      expect(
        OAuthUtils.metadataToOAuthConfig(metadata, 'https://auth.example.com'),
      ).toBeNull();
    });

    it('should return null when token_endpoint uses http (non-loopback)', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'http://auth.example.com/token',
      };

      expect(
        OAuthUtils.metadataToOAuthConfig(metadata, 'https://auth.example.com'),
      ).toBeNull();
    });

    it('should return null when authorization_endpoint domain mismatches authServerUrl', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://evil.com',
        authorization_endpoint: 'https://evil.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      };

      expect(
        OAuthUtils.metadataToOAuthConfig(metadata, 'https://auth.example.com'),
      ).toBeNull();
    });

    it('should return null when token_endpoint domain mismatches authServerUrl', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://evil.com/token',
      };

      expect(
        OAuthUtils.metadataToOAuthConfig(metadata, 'https://auth.example.com'),
      ).toBeNull();
    });

    it('should exclude registrationUrl when endpoints share only a compound TLD but different organizations', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.legit.co.uk',
        authorization_endpoint: 'https://auth.legit.co.uk/authorize',
        token_endpoint: 'https://auth.legit.co.uk/token',
        registration_endpoint: 'https://register.evil.co.uk/register',
      };

      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'https://auth.legit.co.uk',
      );
      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should exclude registrationUrl when registration_endpoint uses http', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'http://auth.example.com/register',
      };
      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'https://auth.example.com',
      );
      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should exclude registrationUrl when authServerUrl uses http', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      };
      const config = OAuthUtils.metadataToOAuthConfig(
        metadata,
        'http://auth.example.com',
      );
      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should discard registrationUrl when no authServerUrl is provided', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://api.example.com/register',
      };
      // No authServerUrl → registration_endpoint is discarded (fail-closed)
      const config = OAuthUtils.metadataToOAuthConfig(metadata);
      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });

    it('should discard registrationUrl when no trusted anchor is available', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
        registration_endpoint: 'https://auth.example.com/register',
      };
      const config = OAuthUtils.metadataToOAuthConfig(metadata);
      expect(config).not.toBeNull();
      expect(config!.registrationUrl).toBeUndefined();
    });
  });

  describe('parseWWWAuthenticateHeader', () => {
    it('should parse resource metadata URI from WWW-Authenticate header', () => {
      const header =
        'Bearer realm="example", resource_metadata="https://example.com/.well-known/oauth-protected-resource"';
      const result = OAuthUtils.parseWWWAuthenticateHeader(header);
      expect(result).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should return null when no resource metadata URI is found', () => {
      const header = 'Bearer realm="example"';
      const result = OAuthUtils.parseWWWAuthenticateHeader(header);
      expect(result).toBeNull();
    });
  });

  describe('extractBaseUrl', () => {
    it('should extract base URL from MCP server URL', () => {
      const result = OAuthUtils.extractBaseUrl('https://example.com/mcp/v1');
      expect(result).toBe('https://example.com');
    });

    it('should handle URLs with ports', () => {
      const result = OAuthUtils.extractBaseUrl(
        'https://example.com:8080/mcp/v1',
      );
      expect(result).toBe('https://example.com:8080');
    });
  });

  describe('isSSEEndpoint', () => {
    it('should return true for SSE endpoints', () => {
      expect(OAuthUtils.isSSEEndpoint('https://example.com/sse')).toBe(true);
      expect(OAuthUtils.isSSEEndpoint('https://example.com/api/v1/sse')).toBe(
        true,
      );
    });

    it('should return true for non-MCP endpoints', () => {
      expect(OAuthUtils.isSSEEndpoint('https://example.com/api')).toBe(true);
    });

    it('should return false for MCP endpoints', () => {
      expect(OAuthUtils.isSSEEndpoint('https://example.com/mcp')).toBe(false);
      expect(OAuthUtils.isSSEEndpoint('https://example.com/api/mcp/v1')).toBe(
        false,
      );
    });
  });

  describe('buildResourceParameter', () => {
    it('should build resource parameter from endpoint URL', () => {
      const result = OAuthUtils.buildResourceParameter(
        'https://example.com/oauth/token',
      );
      expect(result).toBe('https://example.com/oauth/token');
    });

    it('should handle URLs with ports', () => {
      const result = OAuthUtils.buildResourceParameter(
        'https://example.com:8080/oauth/token',
      );
      expect(result).toBe('https://example.com:8080/oauth/token');
    });

    it('should strip query parameters from the URL', () => {
      const result = OAuthUtils.buildResourceParameter(
        'https://example.com/api/v1/data?user=123&scope=read',
      );
      expect(result).toBe('https://example.com/api/v1/data');
    });

    it('should strip URL fragments from the URL', () => {
      const result = OAuthUtils.buildResourceParameter(
        'https://example.com/api/v1/data#section-one',
      );
      expect(result).toBe('https://example.com/api/v1/data');
    });

    it('should throw an error for invalid URLs', () => {
      expect(() => OAuthUtils.buildResourceParameter('not-a-url')).toThrow();
    });
  });

  describe('parseTokenExpiry', () => {
    it('should return the expiry time in milliseconds for a valid token', () => {
      // Corresponds to a date of 2100-01-01T00:00:00Z
      const expiry = 4102444800;
      const payload = { exp: expiry };
      const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
      const result = OAuthUtils.parseTokenExpiry(token);
      expect(result).toBe(expiry * 1000);
    });

    it('should return undefined for a token without an expiry time', () => {
      const payload = { iat: 1678886400 };
      const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
      const result = OAuthUtils.parseTokenExpiry(token);
      expect(result).toBeUndefined();
    });

    it('should return undefined for a token with an invalid expiry time', () => {
      const payload = { exp: 'not-a-number' };
      const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
      const result = OAuthUtils.parseTokenExpiry(token);
      expect(result).toBeUndefined();
    });

    it('should return undefined for a malformed token', () => {
      const token = 'not-a-valid-token';
      const result = OAuthUtils.parseTokenExpiry(token);
      expect(result).toBeUndefined();
    });

    it('should return undefined for a token with invalid JSON in payload', () => {
      const token = `header.${Buffer.from('{ not valid json').toString('base64')}.signature`;
      const result = OAuthUtils.parseTokenExpiry(token);
      expect(result).toBeUndefined();
    });
  });
});
