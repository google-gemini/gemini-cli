/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dnsPromises from 'node:dns/promises';
import type { LookupAddress, LookupAllOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';
import {
  OAuthUtils,
  OAuthSecurityError,
  validateOAuthEndpointUrl,
  isLoopbackUrl,
  type OAuthAuthorizationServerMetadata,
  type OAuthProtectedResourceMetadata,
} from './oauth-utils.js';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuthUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

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

    it('should accept equivalent root resources with and without trailing slash', async () => {
      mockFetch
        // fetchProtectedResourceMetadata
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              resource: 'https://example.com',
              authorization_servers: ['https://auth.example.com'],
              bearer_methods_supported: ['header'],
            }),
        })
        // discoverAuthorizationServerMetadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      await expect(
        OAuthUtils.discoverOAuthConfig('https://example.com'),
      ).resolves.toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        issuer: 'https://auth.example.com',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
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
      });
    });

    it('should handle empty scopes', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token',
      };

      const config = OAuthUtils.metadataToOAuthConfig(metadata);

      expect(config.scopes).toEqual([]);
    });

    it('should use issuer from metadata', () => {
      const metadata: OAuthAuthorizationServerMetadata = {
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/oauth/authorize',
        token_endpoint: 'https://auth.example.com/token',
        scopes_supported: ['read', 'write'],
      };

      const config = OAuthUtils.metadataToOAuthConfig(metadata);

      expect(config.issuer).toBe('https://auth.example.com');
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

  describe('discoverOAuthFromWWWAuthenticate', () => {
    const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      scopes_supported: ['read', 'write'],
    };

    it('should accept equivalent root resources with and without trailing slash', async () => {
      mockFetch
        // fetchProtectedResourceMetadata(resource_metadata URL)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              resource: 'https://example.com',
              authorization_servers: ['https://auth.example.com'],
            }),
        })
        // discoverAuthorizationServerMetadata(auth server well-known URL)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await OAuthUtils.discoverOAuthFromWWWAuthenticate(
        'Bearer realm="example", resource_metadata="https://example.com/.well-known/oauth-protected-resource"',
        'https://example.com/',
      );

      expect(result).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        issuer: 'https://auth.example.com',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
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

  describe('validateOAuthEndpointUrl & SSRF Protections', () => {
    it('should allow valid public HTTPS URLs', async () => {
      const validated = await validateOAuthEndpointUrl(
        'https://auth.example.com/authorize',
      );
      expect(validated).toBe('https://auth.example.com/authorize');
    });

    it('should allow localhost URLs when allowLoopback is true', async () => {
      const validated = await validateOAuthEndpointUrl(
        'http://localhost:3000/oauth',
        { allowLoopback: true },
      );
      expect(validated).toBe('http://localhost:3000/oauth');
    });

    it('should reject HTTP URLs for remote hosts', async () => {
      await expect(
        validateOAuthEndpointUrl('http://auth.example.com/authorize'),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should reject loopback URLs when allowLoopback is false', async () => {
      await expect(
        validateOAuthEndpointUrl('http://127.0.0.1:18080/authorize', {
          allowLoopback: false,
        }),
      ).rejects.toThrow(OAuthSecurityError);

      await expect(
        validateOAuthEndpointUrl('https://localhost:8080/authorize', {
          allowLoopback: false,
        }),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should reject private IPv4 addresses (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', async () => {
      await expect(
        validateOAuthEndpointUrl('https://10.0.0.1/oauth'),
      ).rejects.toThrow(OAuthSecurityError);

      await expect(
        validateOAuthEndpointUrl('https://172.16.0.1/oauth'),
      ).rejects.toThrow(OAuthSecurityError);

      await expect(
        validateOAuthEndpointUrl('https://192.168.1.1/oauth'),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should reject cloud instance metadata endpoints (169.254.169.254)', async () => {
      await expect(
        validateOAuthEndpointUrl('http://169.254.169.254/latest/meta-data'),
      ).rejects.toThrow(OAuthSecurityError);

      await expect(
        validateOAuthEndpointUrl('https://169.254.169.254/computeMetadata/v1'),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should reject domains resolving to private IPs (DNS rebinding / SSRF)', async () => {
      vi.mocked(
        dnsPromises.lookup as (
          hostname: string,
          options: LookupAllOptions,
        ) => Promise<LookupAddress[]>,
      ).mockImplementationOnce(async () => [
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        validateOAuthEndpointUrl('https://attacker-domain.com/metadata'),
      ).rejects.toThrow(/resolves to private network address/);
    });

    it('should reject domains resolving to AWS/GCP metadata IP', async () => {
      vi.mocked(
        dnsPromises.lookup as (
          hostname: string,
          options: LookupAllOptions,
        ) => Promise<LookupAddress[]>,
      ).mockImplementationOnce(async () => [
        { address: '169.254.169.254', family: 4 },
      ]);

      await expect(
        validateOAuthEndpointUrl('https://rebinding-cloud.com/metadata'),
      ).rejects.toThrow(/resolves to private network address/);
    });

    it('should enforce origin matching when expectedOrigin is specified', async () => {
      await expect(
        validateOAuthEndpointUrl('https://attacker.com/metadata', {
          expectedOrigin: 'https://legit-mcp.com',
        }),
      ).rejects.toThrow(/does not match expected origin/);

      const validated = await validateOAuthEndpointUrl(
        'https://legit-mcp.com/metadata',
        {
          expectedOrigin: 'https://legit-mcp.com',
        },
      );
      expect(validated).toBe('https://legit-mcp.com/metadata');
    });

    it('should resolve and validate relative URLs with baseUri', async () => {
      const validated = await validateOAuthEndpointUrl(
        '/.well-known/metadata',
        {
          allowRelative: true,
          baseUri: 'https://legit-mcp.com/mcp',
          expectedOrigin: 'https://legit-mcp.com',
        },
      );
      expect(validated).toBe('https://legit-mcp.com/.well-known/metadata');
    });

    it('should identify loopback URLs correctly', () => {
      expect(isLoopbackUrl('http://localhost:3000')).toBe(true);
      expect(isLoopbackUrl('http://127.0.0.1:8080/mcp')).toBe(true);
      expect(isLoopbackUrl('http://[::1]:9000')).toBe(true);
      expect(isLoopbackUrl('https://example.com')).toBe(false);
      expect(isLoopbackUrl('http://10.0.0.1')).toBe(false);
    });
  });

  describe('SSRF Chained Attack Scenarios', () => {
    it('should block chained SSRF when attacker server points authorization_servers to 127.0.0.1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resource: 'https://mcp.attacker.com/mcp',
            authorization_servers: ['http://127.0.0.1:18080'],
          }),
      });

      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          'Bearer resource_metadata="https://mcp.attacker.com/metadata"',
          'https://mcp.attacker.com/mcp',
        ),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should block chained SSRF when attacker server points resource_metadata to internal IP', async () => {
      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          'Bearer resource_metadata="http://127.0.0.1:18080/metadata"',
          'https://mcp.attacker.com/mcp',
        ),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should block chained SSRF when attacker server points resource_metadata to cloud metadata IP', async () => {
      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          'Bearer resource_metadata="http://169.254.169.254/computeMetadata/v1"',
          'https://mcp.attacker.com/mcp',
        ),
      ).rejects.toThrow(OAuthSecurityError);
    });

    it('should block chained SSRF when attacker returns authorization_servers pointing to 169.254.169.254', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            resource: 'https://mcp.attacker.com/mcp',
            authorization_servers: ['http://169.254.169.254'],
          }),
      });

      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          'Bearer resource_metadata="https://mcp.attacker.com/metadata"',
          'https://mcp.attacker.com/mcp',
        ),
      ).rejects.toThrow(OAuthSecurityError);
    });
  });
});
