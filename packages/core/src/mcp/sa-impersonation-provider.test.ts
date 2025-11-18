/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceAccountImpersonationProvider } from './sa-impersonation-provider.js';
import type { MCPServerConfig } from '../config/config.js';

const mockRequest = vi.fn();
const mockGetClient = vi.fn(() => ({
  request: mockRequest,
}));

// Mock the google-auth-library to use a shared mock function
vi.mock('google-auth-library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('google-auth-library')>();
  return {
    ...actual,
    GoogleAuth: vi.fn().mockImplementation(() => ({
      getClient: mockGetClient,
    })),
  };
});

const defaultSAConfig: MCPServerConfig = {
  url: 'https://my-iap-service.run.app',
  targetAudience: 'my-audience',
  targetServiceAccount: 'my-sa',
};

describe('ServiceAccountImpersonationProvider', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should throw an error if no URL is provided', () => {
    const config: MCPServerConfig = {};
    expect(() => new ServiceAccountImpersonationProvider(config)).toThrow(
      'A url or httpUrl must be provided for the Service Account Impersonation provider',
    );
  });

  it('should throw an error if no targetAudience is provided', () => {
    const config: MCPServerConfig = {
      url: 'https://my-iap-service.run.app',
    };
    expect(() => new ServiceAccountImpersonationProvider(config)).toThrow(
      'targetAudience must be provided for the Service Account Impersonation provider',
    );
  });

  it('should throw an error if no targetSA is provided', () => {
    const config: MCPServerConfig = {
      url: 'https://my-iap-service.run.app',
      targetAudience: 'my-audience',
    };
    expect(() => new ServiceAccountImpersonationProvider(config)).toThrow(
      'targetServiceAccount must be provided for the Service Account Impersonation provider',
    );
  });

  it('should correctly get tokens for a valid config', async () => {
    const mockToken = 'mock-id-token-123';
    mockRequest.mockResolvedValue({ data: { token: mockToken } });

    const provider = new ServiceAccountImpersonationProvider(defaultSAConfig);
    const tokens = await provider.tokens();

    expect(tokens).toBeDefined();
    expect(tokens?.access_token).toBe(mockToken);
    expect(tokens?.token_type).toBe('Bearer');
  });

  it('should return undefined if token acquisition fails', async () => {
    mockRequest.mockResolvedValue({ data: { token: null } });

    const provider = new ServiceAccountImpersonationProvider(defaultSAConfig);
    const tokens = await provider.tokens();

    expect(tokens).toBeUndefined();
  });

  it('should make a request with the correct parameters', async () => {
    mockRequest.mockResolvedValue({ data: { token: 'test-token' } });

    const provider = new ServiceAccountImpersonationProvider(defaultSAConfig);
    await provider.tokens();

    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/my-sa:generateIdToken',
      method: 'POST',
      data: {
        audience: 'my-audience',
        includeEmail: true,
      },
    });
  });

  it('should return a cached token if it is not expired', async () => {
    const provider = new ServiceAccountImpersonationProvider(defaultSAConfig);
    vi.useFakeTimers();

    // jwt payload with exp set to 1 hour from now
    const payload = { exp: Math.floor(Date.now() / 1000) + 3600 };
    const jwt = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;
    mockRequest.mockResolvedValue({ data: { token: jwt } });

    const firstTokens = await provider.tokens();
    expect(firstTokens?.access_token).toBe(jwt);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Advance time by 30 minutes
    vi.advanceTimersByTime(1800 * 1000);

    // Seturn cached token
    const secondTokens = await provider.tokens();
    expect(secondTokens).toBe(firstTokens);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should fetch a new token if the cached token is expired (using fake timers)', async () => {
    const provider = new ServiceAccountImpersonationProvider(defaultSAConfig);
    vi.useFakeTimers();

    // Get and cache a token that expires in 1 second
    const expiredPayload = { exp: Math.floor(Date.now() / 1000) + 1 };
    const expiredJwt = `header.${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}.signature`;

    mockRequest.mockResolvedValue({ data: { token: expiredJwt } });
    const firstTokens = await provider.tokens();
    expect(firstTokens?.access_token).toBe(expiredJwt);
    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Prepare the mock for the *next* call
    const newPayload = { exp: Math.floor(Date.now() / 1000) + 3600 };
    const newJwt = `header.${Buffer.from(JSON.stringify(newPayload)).toString('base64')}.signature`;
    mockRequest.mockResolvedValue({ data: { token: newJwt } });

    vi.advanceTimersByTime(1001);

    const newTokens = await provider.tokens();
    expect(newTokens?.access_token).toBe(newJwt);
    expect(newTokens?.access_token).not.toBe(expiredJwt);
    expect(mockRequest).toHaveBeenCalledTimes(2); // Confirms a new fetch

    vi.useRealTimers();
  });
});
