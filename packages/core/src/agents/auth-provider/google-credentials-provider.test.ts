/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { GoogleCredentialsAuthProvider } from './google-credentials-provider.js';
import type { GoogleCredentialsAuthConfig } from './types.js';
import { GoogleAuth } from 'google-auth-library';
import { OAuthUtils } from '../../mcp/oauth-utils.js';

// Mock the external dependencies
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(),
}));

describe('GoogleCredentialsAuthProvider', () => {
  const mockConfig: GoogleCredentialsAuthConfig = {
    type: 'google-credentials',
  };

  let mockGetClient: Mock;
  let mockGetAccessToken: Mock;
  let mockGetIdTokenClient: Mock;
  let mockFetchIdToken: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetAccessToken = vi
      .fn()
      .mockResolvedValue({ token: 'mock-access-token' });
    mockGetClient = vi.fn().mockResolvedValue({
      getAccessToken: mockGetAccessToken,
      credentials: { expiry_date: Date.now() + 3600 * 1000 },
    });

    mockFetchIdToken = vi.fn().mockResolvedValue('mock-id-token');
    mockGetIdTokenClient = vi.fn().mockResolvedValue({
      idTokenProvider: {
        fetchIdToken: mockFetchIdToken,
      },
    });

    (GoogleAuth as unknown as Mock).mockImplementation(() => ({
      getClient: mockGetClient,
      getIdTokenClient: mockGetIdTokenClient,
    }));
  });

  describe('Initialization', () => {
    it('throws if no targetUrl is provided', () => {
      expect(() => new GoogleCredentialsAuthProvider(mockConfig)).toThrow(
        /targetUrl must be provided/,
      );
    });

    it('throws if targetHost is not allowed', () => {
      expect(
        () =>
          new GoogleCredentialsAuthProvider(mockConfig, 'https://example.com'),
      ).toThrow(/is not an allowed host/);
    });

    it('initializes seamlessly with .googleapis.com', () => {
      expect(
        () =>
          new GoogleCredentialsAuthProvider(
            mockConfig,
            'https://language.googleapis.com/v1/models',
          ),
      ).not.toThrow();
    });

    it('initializes seamlessly with .run.app', () => {
      expect(
        () =>
          new GoogleCredentialsAuthProvider(
            mockConfig,
            'https://my-cloud-run-service.run.app',
          ),
      ).not.toThrow();
    });
  });

  describe('Token Fetching', () => {
    it('fetches an access token for googleapis.com endpoint', async () => {
      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://language.googleapis.com',
      );
      const headers = await provider.headers();

      expect(headers).toEqual({ Authorization: 'Bearer mock-access-token' });
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockGetAccessToken).toHaveBeenCalled();
      expect(mockGetIdTokenClient).not.toHaveBeenCalled();
    });

    it('fetches an identity token for run.app endpoint', async () => {
      // Mock OAuthUtils.parseTokenExpiry to avoid Base64 decoding issues in tests
      vi.spyOn(OAuthUtils, 'parseTokenExpiry').mockReturnValue(
        Date.now() + 1000000,
      );

      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://my-service.run.app/some-path',
      );
      const headers = await provider.headers();

      expect(headers).toEqual({ Authorization: 'Bearer mock-id-token' });
      expect(mockGetIdTokenClient).toHaveBeenCalledWith('my-service.run.app');
      expect(mockFetchIdToken).toHaveBeenCalledWith('my-service.run.app');
      expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('returns cached access token on subsequent calls', async () => {
      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://language.googleapis.com',
      );

      await provider.headers();
      await provider.headers();

      // Should only call getClient/getAccessToken once due to caching
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    it('returns cached id token on subsequent calls', async () => {
      vi.spyOn(OAuthUtils, 'parseTokenExpiry').mockReturnValue(
        Date.now() + 1000000,
      );

      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://my-service.run.app',
      );

      await provider.headers();
      await provider.headers();

      expect(mockGetIdTokenClient).toHaveBeenCalledTimes(1);
      expect(mockFetchIdToken).toHaveBeenCalledTimes(1);
    });

    it('re-fetches access token on 401 (shouldRetryWithHeaders)', async () => {
      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://language.googleapis.com',
      );

      // Prime the cache
      await provider.headers();
      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

      const req = {} as RequestInit;
      const res = { status: 401 } as Response;

      const retryHeaders = await provider.shouldRetryWithHeaders(req, res);

      expect(retryHeaders).toEqual({
        Authorization: 'Bearer mock-access-token',
      });
      // Cache was cleared, so getAccessToken was called again
      expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });

    it('re-fetches token on 403', async () => {
      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://language.googleapis.com',
      );

      const req = {} as RequestInit;
      const res = { status: 403 } as Response;

      const retryHeaders = await provider.shouldRetryWithHeaders(req, res);

      expect(retryHeaders).toEqual({
        Authorization: 'Bearer mock-access-token',
      });
    });

    it('stops retrying after MAX_AUTH_RETRIES', async () => {
      const provider = new GoogleCredentialsAuthProvider(
        mockConfig,
        'https://language.googleapis.com',
      );

      const req = {} as RequestInit;
      const res = { status: 401 } as Response;

      // First two retries should succeed (MAX_AUTH_RETRIES = 2)
      expect(await provider.shouldRetryWithHeaders(req, res)).toBeDefined();
      expect(await provider.shouldRetryWithHeaders(req, res)).toBeDefined();

      // Third should return undefined (exhausted)
      expect(await provider.shouldRetryWithHeaders(req, res)).toBeUndefined();
    });
  });
});
