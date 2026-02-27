/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MCPOAuthClientProvider,
  type OAuthAuthorizationResponse,
} from './mcp-oauth-provider.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

describe('MCPOAuthClientProvider', () => {
  const mockRedirectUrl = 'http://localhost:8090/callback';
  const mockClientMetadata: OAuthClientMetadata = {
    client_name: 'Test Client',
    redirect_uris: [mockRedirectUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
    scope: 'test-scope',
  };
  const mockState = 'test-state-123';

  describe('oauth flow', () => {
    it('should support full OAuth flow', async () => {
      const onRedirectMock = vi.fn();
      const provider = new MCPOAuthClientProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockState,
        onRedirectMock,
      );

      // Step 1: Save client information
      const clientInfo: OAuthClientInformation = {
        client_id: 'my-client-id',
        client_secret: 'my-client-secret',
      };
      provider.saveClientInformation(clientInfo);

      // Step 2: Save code verifier
      provider.saveCodeVerifier('my-code-verifier');

      // Step 3: Set up callback server
      const mockAuthResponse: OAuthAuthorizationResponse = {
        code: 'authorization-code',
        state: mockState,
      };
      const mockServer = {
        port: Promise.resolve(8090),
        waitForResponse: vi.fn().mockResolvedValue(mockAuthResponse),
        close: vi.fn().mockResolvedValue(undefined),
      };
      provider.saveCallbackServer(mockServer);

      // Step 4: Redirect to authorization
      const authUrl = new URL('http://auth.example.com/authorize');
      await provider.redirectToAuthorization(authUrl);

      // Step 5: Save tokens after exchange
      const tokens: OAuthTokens = {
        access_token: 'final-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'final-refresh-token',
      };
      provider.saveTokens(tokens);

      // Verify all data is stored correctly
      expect(provider.clientInformation()).toEqual(clientInfo);
      expect(provider.codeVerifier()).toBe('my-code-verifier');
      expect(provider.state()).toBe(mockState);
      expect(provider.tokens()).toEqual(tokens);
      expect(onRedirectMock).toHaveBeenCalledWith(authUrl);
      expect(provider.getSavedCallbackServer()).toBe(mockServer);
    });
  });
});
