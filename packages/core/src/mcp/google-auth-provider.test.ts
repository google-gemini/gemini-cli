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

  it('should throw an error if no scopes are provided', () => {
    const config = {
      url: 'https://test.googleapis.com',
    } as MCPServerConfig;
    expect(() => new GoogleCredentialProvider(config)).toThrow(
      'Scopes must be provided in the oauth config for Google Credentials provider',
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

  describe('with provider instance', () => {
    let provider: GoogleCredentialProvider;
    let mockGetAccessToken: Mock;
    let mockClient: {
      getAccessToken: Mock;
      credentials?: { expiry_date: number | null };
      quotaProjectId?: string;
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

    it('should return quota project ID', async () => {
      mockClient['quotaProjectId'] = 'test-project-id';
      const quotaProjectId = await provider.getQuotaProjectId();
      expect(quotaProjectId).toBe('test-project-id');
    });

    it('should return request headers with quota project ID', async () => {
      mockClient['quotaProjectId'] = 'test-project-id';
      const headers = await provider.getRequestHeaders();
      expect(headers).toEqual({
        'X-Goog-User-Project': 'test-project-id',
      });
    });

    it('should return empty request headers if quota project ID is missing', async () => {
      mockClient['quotaProjectId'] = undefined;
      const headers = await provider.getRequestHeaders();
      expect(headers).toEqual({});
    });

    it('should prioritize config headers over quota project ID', async () => {
      mockClient['quotaProjectId'] = 'quota-project-id';
      const configWithHeaders = {
        ...validConfig,
        headers: {
          'X-Goog-User-Project': 'config-project-id',
        },
      };
      const providerWithHeaders = new GoogleCredentialProvider(
        configWithHeaders,
      );
      const headers = await providerWithHeaders.getRequestHeaders();
      expect(headers).toEqual({
        'X-Goog-User-Project': 'config-project-id',
      });
    });
    it('should prioritize config headers over quota project ID (case-insensitive)', async () => {
      mockClient['quotaProjectId'] = 'quota-project-id';
      const configWithHeaders = {
        ...validConfig,
        headers: {
          'x-goog-user-project': 'config-project-id',
        },
      };
      const providerWithHeaders = new GoogleCredentialProvider(
        configWithHeaders,
      );
      const headers = await providerWithHeaders.getRequestHeaders();
      expect(headers).toEqual({
        'x-goog-user-project': 'config-project-id',
      });
    });
  });
});
