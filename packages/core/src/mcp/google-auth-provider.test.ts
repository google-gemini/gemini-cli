/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import { GoogleCredentialProvider } from './google-auth-provider.js';
import type { Mock } from 'vitest';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import type { MCPServerConfig } from '../config/config.js';

vi.mock('google-auth-library');

describe('GoogleCredentialProvider', () => {
  const validConfig = {
    url: 'https://test.googleapis.com',
    oauth: {
      scopes: ['scope1', 'scope2'],
    },
  } as MCPServerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw an error if no scopes are provided', () => {
    const config = {
      url: 'https://test.googleapis.com',
    } as MCPServerConfig;
    expect(() => new GoogleCredentialProvider(config)).toThrow(
      'Scopes must be provided in the oauth config for Google Credentials provider (or enable allow_unscoped_id_tokens_for_cloud_run to use ID tokens for Cloud Run endpoints)',
    );
  });

  it('should use scopes from the config if provided', () => {
    new GoogleCredentialProvider(validConfig);
    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: ['scope1', 'scope2'],
    });
  });

  it('should throw an error for a non-allowlisted host', () => {
    const config = {
      url: 'https://example.com',
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    expect(() => new GoogleCredentialProvider(config)).toThrow(
      'Host "example.com" is not an allowed host for Google Credential provider.',
    );
  });

  it('should allow luci.app', () => {
    const config = {
      url: 'https://luci.app',
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    new GoogleCredentialProvider(config);
  });

  it('should allow sub.luci.app', () => {
    const config = {
      url: 'https://sub.luci.app',
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    new GoogleCredentialProvider(config);
  });

  it('should not allow googleapis.com without a subdomain', () => {
    const config = {
      url: 'https://googleapis.com',
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    expect(() => new GoogleCredentialProvider(config)).toThrow(
      'Host "googleapis.com" is not an allowed host for Google Credential provider.',
    );
  });

  it('should not allow run.app host even when unscoped ID token flag is not present', () => {
    const config = {
      url: 'https://test.run.app',
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    expect(() => new GoogleCredentialProvider(config)).toThrow(
      'To enable the Cloud Run MCP Server at https://test.run.app please set allow_unscoped_id_tokens_cloud_run:true in the MCP Server config.',
    );
  });

  describe('with provider instance (Access Tokens)', () => {
    let provider: GoogleCredentialProvider;
    let mockGetAccessToken: Mock;
    let mockClient: {
      getAccessToken: Mock;
      credentials?: { expiry_date: number | null };
    };

    beforeEach(() => {
      // clear and reset mock client before each test
      mockGetAccessToken = vi.fn();
      mockClient = {
        getAccessToken: mockGetAccessToken,
      };
      (GoogleAuth.prototype.getClient as Mock).mockResolvedValue(mockClient);
      provider = new GoogleCredentialProvider(validConfig);
    });

    it('should return credentials', async () => {
      mockGetAccessToken.mockResolvedValue({ token: 'test-token' });

      const credentials = await provider.tokens();
      expect(credentials?.access_token).toBe('test-token');
    });

    it('should return undefined if access token is not available', async () => {
      mockGetAccessToken.mockResolvedValue({ token: null });

      const credentials = await provider.tokens();
      expect(credentials).toBeUndefined();
    });

    it('should return a cached token if it is not expired', async () => {
      vi.useFakeTimers();
      mockClient.credentials = { expiry_date: Date.now() + 3600 * 1000 }; // 1 hour
      mockGetAccessToken.mockResolvedValue({ token: 'test-token' });

      // first call
      const firstTokens = await provider.tokens();
      expect(firstTokens?.access_token).toBe('test-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // second call
      vi.advanceTimersByTime(1800 * 1000); // Advance time by 30 minutes
      const secondTokens = await provider.tokens();
      expect(secondTokens).toBe(firstTokens);
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1); // Should not be called again

      vi.useRealTimers();
    });

    it('should fetch a new token if the cached token is expired', async () => {
      vi.useFakeTimers();

      // first call
      mockClient.credentials = { expiry_date: Date.now() + 1000 }; // Expires in 1 second
      mockGetAccessToken.mockResolvedValue({ token: 'expired-token' });

      const firstTokens = await provider.tokens();
      expect(firstTokens?.access_token).toBe('expired-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      // second call
      vi.advanceTimersByTime(1001); // Advance time past expiry
      mockClient.credentials = { expiry_date: Date.now() + 3600 * 1000 }; // New expiry
      mockGetAccessToken.mockResolvedValue({ token: 'new-token' });

      const newTokens = await provider.tokens();
      expect(newTokens?.access_token).toBe('new-token');
      expect(mockGetAccessToken).toHaveBeenCalledTimes(2); // new fetch

      vi.useRealTimers();
    });
  });

  describe('ID token flow (allow_unscoped_id_tokens_cloud_run)', () => {
    let mockFetchIdToken: Mock;
    let mockIdClient: {
      idTokenProvider: {
        fetchIdToken: Mock;
      };
    };

    beforeEach(() => {
      mockFetchIdToken = vi.fn();
      mockIdClient = {
        idTokenProvider: {
          fetchIdToken: mockFetchIdToken,
        },
      };
      (GoogleAuth.prototype.getIdTokenClient as Mock).mockResolvedValue(
        mockIdClient,
      );
    });

    it('should return ID token when flag is enabled and derive audience from hostname', async () => {
      const config = {
        url: 'https://test.run.app/path',
        allow_unscoped_id_tokens_cloud_run: true,
      } as MCPServerConfig;
      const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
      const validToken = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
      mockFetchIdToken.mockResolvedValue(validToken);

      const provider = new GoogleCredentialProvider(config);
      const tokens = await provider.tokens();
      expect(tokens?.access_token).toBe(validToken);
      expect(GoogleAuth.prototype.getIdTokenClient).toHaveBeenCalledWith(
        'test.run.app',
      );
      expect(mockFetchIdToken).toHaveBeenCalledWith('test.run.app');
    });

    it('should return undefined and log error when fetching ID token fails', async () => {
      const config = {
        url: 'https://test.run.app/path',
        allow_unscoped_id_tokens_cloud_run: true,
      } as MCPServerConfig;
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockFetchIdToken.mockRejectedValue(new Error('Fetch failed'));

      const provider = new GoogleCredentialProvider(config);
      const tokens = await provider.tokens();
      expect(tokens).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to get ID token from Google ADC',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });

    it('should not require scopes when flag allow_unscoped_id_tokens_cloud_run is true', () => {
      const config = {
        url: 'https://test.run.app',
        allow_unscoped_id_tokens_cloud_run: true,
      } as MCPServerConfig;

      expect(() => new GoogleCredentialProvider(config)).not.toThrow();
    });
  });
});
