/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type HttpHeaders } from '@a2a-js/sdk/client';
import { z } from 'zod';
import { BaseA2AAuthProvider } from './base-provider.js';
import type { OpenIdConnectAuthConfig } from './types.js';
import type { OAuthToken } from '../../mcp/token-storage/types.js';
import {
  generatePKCEParams,
  startCallbackServer,
  buildAuthorizationUrl,
  exchangeCodeForToken,
} from '../../utils/oauth-flow.js';
import { openBrowserSecurely } from '../../utils/secure-browser-launcher.js';
import { getConsentForOauth } from '../../utils/authConsent.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { Storage } from '../../config/storage.js';

const OidcDiscoverySchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
});

/**
 * Authentication provider for OpenID Connect (OIDC).
 * Extends OAuth2 with dynamic discovery and identity token handling.
 */
export class OpenIdConnectAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'openIdConnect' as const;

  private tokenStorage?: import('../../mcp/oauth-token-storage.js').MCPOAuthTokenStorage;
  private cachedToken: OAuthToken | null = null;

  /** Discovery endpoints */
  private authorizationUrl?: string;
  private tokenUrl?: string;

  constructor(
    private readonly config: OpenIdConnectAuthConfig,
    private readonly agentName: string,
  ) {
    super();

    // Security: Enforce HTTPS for issuer URL to prevent MITM and SSRF
    if (!this.config.issuer_url.startsWith('https://')) {
      throw new Error('OIDC issuer_url must use HTTPS');
    }
  }

  private async getTokenStorage(): Promise<
    import('../../mcp/oauth-token-storage.js').MCPOAuthTokenStorage
  > {
    if (!this.tokenStorage) {
      const { MCPOAuthTokenStorage } = await import(
        '../../mcp/oauth-token-storage.js'
      );
      this.tokenStorage = new MCPOAuthTokenStorage(
        Storage.getA2AOAuthTokensPath(),
        'gemini-cli-a2a-oidc',
      );
    }
    return this.tokenStorage;
  }

  /**
   * Performs OIDC Discovery to find endpoints.
   */
  override async initialize(): Promise<void> {
    debugLogger.debug(
      `[OIDC] Initializing discovery for ${this.config.issuer_url}`,
    );

    try {
      const discoveryUrl = this.config.issuer_url.endsWith('/')
        ? `${this.config.issuer_url}.well-known/openid-configuration`
        : `${this.config.issuer_url}/.well-known/openid-configuration`;

      const response = await fetch(discoveryUrl);
      if (!response.ok)
        throw new Error(`Discovery failed: ${response.statusText}`);

      const data: unknown = await response.json();
      const parsed = OidcDiscoverySchema.parse(data);

      // Security: Validate that discovered endpoints also use HTTPS
      if (
        !parsed.authorization_endpoint.startsWith('https://') ||
        !parsed.token_endpoint.startsWith('https://')
      ) {
        throw new Error('OIDC discovery returned non-HTTPS endpoints');
      }

      this.authorizationUrl = parsed.authorization_endpoint;
      this.tokenUrl = parsed.token_endpoint;

      debugLogger.debug(`[OIDC] Discovered endpoints for ${this.agentName}`);
    } catch (error) {
      debugLogger.error(`[OIDC] Failed to discover OIDC endpoints: ${error}`);
      throw error;
    }

    // Load existing token if available
    const storage = await this.getTokenStorage();
    const credentials = await storage.getCredentials(this.agentName);
    if (credentials && !storage.isTokenExpired(credentials.token)) {
      this.cachedToken = credentials.token;
    }
  }

  override async headers(): Promise<HttpHeaders> {
    const storage = await this.getTokenStorage();
    if (this.cachedToken && !storage.isTokenExpired(this.cachedToken)) {
      return { Authorization: `Bearer ${this.cachedToken.accessToken}` };
    }

    // TODO: Add refresh logic similar to OAuth2AuthProvider

    this.cachedToken = await this.authenticateInteractively();
    return { Authorization: `Bearer ${this.cachedToken.accessToken}` };
  }

  private async authenticateInteractively(): Promise<OAuthToken> {
    if (!this.authorizationUrl || !this.tokenUrl) {
      throw new Error('OIDC provider not initialized (endpoints missing)');
    }

    await getConsentForOauth(this.agentName);

    const pkce = generatePKCEParams();
    const { port, response } = startCallbackServer(pkce.state);

    const authUrl = buildAuthorizationUrl(
      {
        clientId: this.config.client_id,
        authorizationUrl: this.authorizationUrl,
        tokenUrl: this.tokenUrl,
        scopes: ['openid', ...(this.config.scopes || [])],
      },
      pkce,
      await port,
    );

    await openBrowserSecurely(authUrl);
    const { code } = await response;

    const tokenResponse = await exchangeCodeForToken(
      {
        clientId: this.config.client_id,
        clientSecret: this.config.client_secret,
        authorizationUrl: this.authorizationUrl,
        tokenUrl: this.tokenUrl,
      },
      code,
      pkce.codeVerifier,
      await port,
    );

    // TODO: Validate id_token if needed

    const token: OAuthToken = {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined,
    };

    const storage = await this.getTokenStorage();
    await storage.setCredentials({
      serverName: this.agentName,
      token,
      updatedAt: Date.now(),
    });
    return token;
  }
}
