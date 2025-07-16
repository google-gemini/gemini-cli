/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OAuthUtils,
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
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
    it('should build correct well-known URLs', () => {
      const urls = OAuthUtils.buildWellKnownUrls('https://example.com/path');
      expect(urls.protectedResource).toBe(
        'https://example.com/.well-known/oauth-protected-resource',
      );
      expect(urls.authorizationServer).toBe(
        'https://example.com/.well-known/oauth-authorization-server',
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
        'Bearer realm="example", resource_metadata_uri="https://example.com/.well-known/oauth-protected-resource"';
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
      expect(result).toBe('https://example.com');
    });

    it('should handle URLs with ports', () => {
      const result = OAuthUtils.buildResourceParameter(
        'https://example.com:8080/oauth/token',
      );
      expect(result).toBe('https://example.com:8080');
    });
  });
});
