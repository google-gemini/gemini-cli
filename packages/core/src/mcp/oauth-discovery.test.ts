/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  discoverOAuthConfig,
  parseWWWAuthenticateHeader,
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './oauth-discovery.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OAuth Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverOAuthConfig', () => {
    const mockAuthServerMetadata: OAuthAuthorizationServerMetadata = {
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/authorize',
      token_endpoint: 'https://auth.example.com/token',
      registration_endpoint: 'https://auth.example.com/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['read', 'write'],
    };

    const mockResourceMetadata: OAuthProtectedResourceMetadata = {
      resource: 'https://api.example.com',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
    };

    it('should discover OAuth config via protected resource metadata', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/.well-known/oauth-protected-resource',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should fallback to direct authorization server discovery', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/.well-known/oauth-authorization-server',
      );
    });

    it('should return null when no OAuth metadata is found', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toBeNull();
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('No OAuth authorization server metadata found'),
      );
    });

    it('should handle protected resource metadata without authorization servers', async () => {
      const resourceMetadataWithoutAuthServers = {
        ...mockResourceMetadata,
        authorization_servers: undefined,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(resourceMetadataWithoutAuthServers),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toEqual({
        authorizationUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        scopes: ['read', 'write'],
      });
    });

    it('should handle authorization server metadata fetch failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResourceMetadata),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to fetch authorization server metadata',
        ),
      );
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toBeNull();
      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to discover OAuth configuration'),
      );
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toBeNull();
    });

    it('should handle authorization server metadata without required endpoints', async () => {
      const incompleteMetadata = {
        ...mockAuthServerMetadata,
        authorization_endpoint: undefined,
        token_endpoint: undefined,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(incompleteMetadata),
        });

      const result = await discoverOAuthConfig('https://api.example.com');

      expect(result).toEqual({
        authorizationUrl: undefined,
        tokenUrl: undefined,
        scopes: ['read', 'write'],
      });
    });

    it('should handle servers with different protocol and port', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      const result = await discoverOAuthConfig('http://localhost:8080/api');

      expect(result).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/.well-known/oauth-authorization-server',
      );
    });

    it('should log dynamic client registration availability', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockAuthServerMetadata),
        });

      await discoverOAuthConfig('https://api.example.com');

      expect(console.log).toHaveBeenCalledWith(
        'Dynamic client registration is supported at:',
        'https://auth.example.com/register',
      );
    });
  });

  describe('parseWWWAuthenticateHeader', () => {
    it('should extract resource metadata URI from Bearer header', () => {
      const header =
        'Bearer realm="MCP Server", resource_metadata_uri="https://auth.example.com/.well-known/oauth-protected-resource"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBe(
        'https://auth.example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should handle header with different parameter order', () => {
      const header =
        'Bearer resource_metadata_uri="https://auth.example.com/.well-known/oauth-protected-resource", realm="MCP Server"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBe(
        'https://auth.example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should return null for header without resource_metadata_uri', () => {
      const header = 'Bearer realm="MCP Server"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const header = 'Basic realm="Protected Area"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBeNull();
    });

    it('should handle empty or invalid headers', () => {
      expect(parseWWWAuthenticateHeader('')).toBeNull();
      expect(parseWWWAuthenticateHeader('Invalid header')).toBeNull();
      expect(parseWWWAuthenticateHeader('Bearer')).toBeNull();
    });

    it('should handle headers with special characters in URI', () => {
      const header =
        'Bearer resource_metadata_uri="https://auth.example.com/.well-known/oauth-protected-resource?param=value&other=test"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBe(
        'https://auth.example.com/.well-known/oauth-protected-resource?param=value&other=test',
      );
    });

    it('should handle headers with additional parameters', () => {
      const header =
        'Bearer realm="MCP Server", resource_metadata_uri="https://auth.example.com/.well-known/oauth-protected-resource", scope="read write", error="insufficient_scope"';

      const result = parseWWWAuthenticateHeader(header);

      expect(result).toBe(
        'https://auth.example.com/.well-known/oauth-protected-resource',
      );
    });
  });
});
