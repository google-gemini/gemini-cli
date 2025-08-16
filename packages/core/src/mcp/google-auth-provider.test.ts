/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import { GoogleCredentialProvider } from './google-auth-provider.js';
import { vi, describe, beforeEach, it, expect, Mock } from 'vitest';
import { MCPServerConfig } from '../config/config.js';

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

    beforeEach(() => {
      provider = new GoogleCredentialProvider(validConfig);
      vi.clearAllMocks();
    });

    it('should return credentials', async () => {
      const mockClient = {
        getAccessToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
      };
      (GoogleAuth.prototype.getClient as Mock).mockResolvedValue(mockClient);

      const credentials = await provider.tokens();

      expect(credentials?.access_token).toBe('test-token');
    });

    it('should return undefined if access token is not available', async () => {
      const mockClient = {
        getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      };
      (GoogleAuth.prototype.getClient as Mock).mockResolvedValue(mockClient);

      const credentials = await provider.tokens();
      expect(credentials).toBeUndefined();
    });
  });
});
