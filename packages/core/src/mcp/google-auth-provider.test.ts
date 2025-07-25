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
  it('should throw an error if no scopes are provided', () => {
    expect(() => new GoogleCredentialProvider()).toThrow(
      'Scopes must be provided in the oauth config for Google Credentials provider',
    );
  });

  it('should use scopes from the config if provided', () => {
    const config = {
      oauth: {
        scopes: ['scope1', 'scope2'],
      },
    } as MCPServerConfig;
    new GoogleCredentialProvider(config);
    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: ['scope1', 'scope2'],
    });
  });

  describe('with provider instance', () => {
    let provider: GoogleCredentialProvider;

    beforeEach(() => {
      const config = {
        oauth: {
          scopes: ['scope1', 'scope2'],
        },
      } as MCPServerConfig;
      provider = new GoogleCredentialProvider(config);
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
