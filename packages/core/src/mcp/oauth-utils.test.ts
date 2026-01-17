/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './oauth-utils.js';
import { OAuthUtils } from './oauth-utils.js';

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
    it('should build standard root-based URLs by default', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com/mcp');
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should build path-based URLs when includePathSuffix is true', () => {
      const urls = OAuthUtils.buildWellKnownUrls(
        'https://example.com/mcp',
        true,
      );
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server/mcp',
      );
    });

    it('should handle root path correctly', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com', true);
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should handle trailing slash in path', () => {
      const urls = OAuthUtils.buildWellKnownUrls(
        'https://example.com/mcp/',
        true,
      );
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server/mcp',
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

  describe('validateResourceMatch', () => {
    it('should pass for exact match', () => {
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp',
          'https://example.com/mcp',
        ),
      ).not.toThrow();
    });

    it('should fail for parent resource match by default (strict mode)', () => {
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp',
          'https://example.com',
        ),
      ).toThrow(/strict mode enabled by default/);
    });

    it('should pass for parent resource match when strict mode is explicitly disabled', () => {
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp',
          'https://example.com',
          false, // Explicitly disable strict mode
        ),
      ).not.toThrow();
    });

    it('should fail for sibling path match', () => {
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp',
          'https://example.com/other',
        ),
      ).toThrow(/does not match expected/);
    });

    it('should handle trailing slashes correctly', () => {
      // Expected has slash, actual does not
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp/',
          'https://example.com/mcp',
        ),
      ).not.toThrow();

      // Expected does not have slash, actual does
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp',
          'https://example.com/mcp/',
        ),
      ).not.toThrow();

      // Both have slashes
      expect(() =>
        OAuthUtils.validateResourceMatch(
          'https://example.com/mcp/',
          'https://example.com/mcp/',
        ),
      ).not.toThrow();
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

    it('should try path-based discovery first when path is present', async () => {
      mockFetch
        // Path-based fail
        .mockResolvedValueOnce({ ok: false })
        // Root-based success
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        // Authorization server metadata discovery
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/mcp',
      );

      expect(config).toBeDefined();
      // First call should be path-based
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      // Second call should be root-based
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should succeed when resource metadata matches server URL', async () => {
      mockFetch
        // Fetch protected resource metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        // Discover authorization server metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/mcp',
      );

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
    });

    it('should use incomplete path-based metadata and fallback to auth server discovery', async () => {
      mockFetch
        // 1. Path-based protected resource -> Success (but incomplete)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ resource: 'https://example.com/mcp' }),
        })
        // 2. Auth server discovery starts (discoverAuthorizationServerMetadata)
        // It will try path-based auth server URL first
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/mcp',
      );

      expect(config).toBeDefined();
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/.well-known/oauth-protected-resource/mcp',
      );
      // It should NOT call root-based protected resource
      expect(mockFetch).not.toHaveBeenCalledWith(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      // It should proceed to auth server discovery
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/.well-known/oauth-authorization-server/mcp',
      );
    });

    it('should only try root-based discovery if no path is present', async () => {
      mockFetch
        // Root-based success
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockResourceMetadata,
              resource: 'https://example.com',
            }),
        })
        // Authorization server metadata discovery
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/',
      );

      expect(config).toBeDefined();
      // Should only call root-based
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('oauth-protected-resource/'),
      );
    });

    it('should fail for parent resource metadata by default (strict mode)', async () => {
      mockFetch
        // Fetch protected resource metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockResourceMetadata,
              resource: 'https://example.com', // Parent resource
            }),
        })
        // Discover authorization server metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      await expect(
        OAuthUtils.discoverOAuthConfig('https://example.com/mcp'),
      ).rejects.toThrow(/strict mode enabled by default/);
    });

    it('should pass for parent resource metadata when strict mode is disabled (relaxed mode)', async () => {
      mockFetch
        // Fetch protected resource metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockResourceMetadata,
              resource: 'https://example.com', // Parent resource
            }),
        })
        // Discover authorization server metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const config = await OAuthUtils.discoverOAuthConfig(
        'https://example.com/mcp',
        { strictResourceMatching: false },
      );

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
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
  });

  describe('discoverOAuthFromWWWAuthenticate', () => {
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

    it('should discover config from WWW-Authenticate header', async () => {
      mockFetch
        // Fetch protected resource metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        // Discover authorization server metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const header =
        'Bearer realm="example", resource_metadata="https://example.com/.well-known/oauth-protected-resource"';
      const config = await OAuthUtils.discoverOAuthFromWWWAuthenticate(
        header,
        'https://example.com/mcp',
      );

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
    });

    it('should fail validation by default if resource does not match exactly (strict mode)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockResourceMetadata,
            resource: 'https://example.com', // Parent resource
          }),
      });

      const header =
        'Bearer realm="example", resource_metadata="https://example.com/.well-known/oauth-protected-resource"';
      await expect(
        OAuthUtils.discoverOAuthFromWWWAuthenticate(
          header,
          'https://example.com/mcp',
        ),
      ).rejects.toThrow(/strict mode enabled by default/);
    });

    it('should pass validation if strictResourceMatching is disabled (relaxed mode)', async () => {
      mockFetch
        // Fetch protected resource metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockResourceMetadata,
              resource: 'https://example.com', // Parent resource
            }),
        })
        // Discover authorization server metadata
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const header =
        'Bearer realm="example", resource_metadata="https://example.com/.well-known/oauth-protected-resource"';
      const config = await OAuthUtils.discoverOAuthFromWWWAuthenticate(
        header,
        'https://example.com/mcp',
        { strictResourceMatching: false },
      );

      expect(config).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
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
