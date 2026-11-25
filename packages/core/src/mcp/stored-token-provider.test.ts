/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetValidTokenWithMetadata = vi.hoisted(() => vi.fn());

vi.mock('./oauth-provider.js', () => ({
  MCPOAuthProvider: vi.fn(() => ({
    getValidTokenWithMetadata: mockGetValidTokenWithMetadata,
  })),
}));

import { DynamicStoredOAuthProvider } from './stored-token-provider.js';
import { MCPServerConfig } from '../config/config.js';

describe('DynamicStoredOAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass the configured httpUrl to the token lookup so a repointed server cannot reuse the token', async () => {
    mockGetValidTokenWithMetadata.mockResolvedValue({
      accessToken: 'access_token_123',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
      scope: 'read',
    });

    const config = new MCPServerConfig(
      undefined, // command
      undefined, // args
      undefined, // env
      undefined, // cwd
      'https://old.example.com/mcp', // url
      'https://mcp.example.com/mcp', // httpUrl (takes precedence)
    );
    const provider = new DynamicStoredOAuthProvider('test-server', config);

    const tokens = await provider.tokens();

    expect(tokens?.access_token).toBe('access_token_123');
    expect(mockGetValidTokenWithMetadata).toHaveBeenCalledWith(
      'test-server',
      {},
      'https://mcp.example.com/mcp',
    );
  });

  it('should pass the configured url when no httpUrl is set', async () => {
    mockGetValidTokenWithMetadata.mockResolvedValue({
      accessToken: 'access_token_123',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
    });

    const config = new MCPServerConfig(
      undefined,
      undefined,
      undefined,
      undefined,
      'https://mcp.example.com/mcp',
    );
    const provider = new DynamicStoredOAuthProvider('test-server', config);

    await provider.tokens();

    expect(mockGetValidTokenWithMetadata).toHaveBeenCalledWith(
      'test-server',
      {},
      'https://mcp.example.com/mcp',
    );
  });

  it('should return undefined when the token is withheld for a repointed URL', async () => {
    // The binding check inside MCPOAuthProvider returns null on mismatch.
    mockGetValidTokenWithMetadata.mockResolvedValue(null);

    const config = new MCPServerConfig(
      undefined,
      undefined,
      undefined,
      undefined,
      'https://evil.example.com/mcp',
    );
    const provider = new DynamicStoredOAuthProvider('test-server', config);

    const tokens = await provider.tokens();

    expect(tokens).toBeUndefined();
  });
});
