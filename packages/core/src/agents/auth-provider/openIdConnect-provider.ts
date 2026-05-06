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
  refreshAccessToken,
} from '../../utils/oauth-flow.js';
import { openBrowserSecurely } from '../../utils/secure-browser-launcher.js';
import { getConsentForOauth } from '../../utils/authConsent.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { Storage } from '../../config/storage.js';
import { getErrorMessage } from '../../utils/errors.js';

const OidcDiscoverySchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
});

type OidcEndpoints = z.infer<typeof OidcDiscoverySchema>;

/**
 * Authentication provider for OpenID Connect (OIDC).
 * Extends OAuth2 with dynamic discovery and identity token handling.
 */
export class OpenIdConnectAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'openIdConnect' as const;

  private tokenStorage?: import('../../mcp/oauth-token-storage.js').MCPOAuthTokenStorage;
  private cachedToken: OAuthToken | null = null;

  private constructor(
    private readonly config: OpenIdConnectAuthConfig,
    private readonly agentName: string,
    private readonly endpoints: OidcEndpoints,
  ) {
    super();
  }

  /**
   * Factory method to discover endpoints and create a validated provider instance.
   * This ensures all remote settings are gathered before object initialization
   * to avoid resource leaks and unvalidated states.
   */
  static async create(
    config: OpenIdConnectAuthConfig,
    agentName: string,
  ): Promise<OpenIdConnectAuthProvider> {
    // Security: Enforce HTTPS for issuer URL
    if (!config.issuer_url.startsWith('https://')) {
      throw new Error('OIDC issuer_url must use HTTPS');
    }

    const discoveryUrl = config.issuer_url.endsWith('/')
      ? `${config.issuer_url}.well-known/openid-configuration`
      : `${config.issuer_url}/.well-known/openid-configuration`;

    debugLogger.debug(`[OIDC] Performing discovery at ${discoveryUrl}`);

    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new Error(`OIDC Discovery failed: ${response.statusText}`);
    }

    const data: unknown = await response.json();
    const endpoints = OidcDiscoverySchema.parse(data);

    // Security: Validate that discovered endpoints also use HTTPS to prevent MITM
    if (
      !endpoints.authorization_endpoint.startsWith('https://') ||
      !endpoints.token_endpoint.startsWith('https://')
    ) {
      throw new Error('OIDC discovery returned non-HTTPS endpoints');
    }

    const instance = new OpenIdConnectAuthProvider(
      config,
      agentName,
      endpoints,
    );
    await instance.initializeFromCache();
    return instance;
  }

  private async initializeFromCache(): Promise<void> {
    const storage = await this.getTokenStorage();
    const credentials = await storage.getCredentials(this.agentName);
    if (credentials && !storage.isTokenExpired(credentials.token)) {
      this.cachedToken = credentials.token;
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

  override async headers(): Promise<HttpHeaders> {
    const storage = await this.getTokenStorage();

    // 1. Valid cached token → return immediately.
    if (this.cachedToken && !storage.isTokenExpired(this.cachedToken)) {
      return { Authorization: `Bearer ${this.cachedToken.accessToken}` };
    }

    // 2. Expired but has refresh token → attempt silent refresh.
    if (this.cachedToken?.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(
          {
            clientId: this.config.client_id,
            clientSecret: this.config.client_secret,
            scopes: ['openid', ...(this.config.scopes || [])],
          },
          this.cachedToken.refreshToken,
          this.endpoints.token_endpoint,
        );

        this.cachedToken = {
          accessToken: refreshed.access_token,
          tokenType: refreshed.token_type || 'Bearer',
          refreshToken:
            refreshed.refresh_token ?? this.cachedToken.refreshToken,
          expiresAt: refreshed.expires_in
            ? Date.now() + refreshed.expires_in * 1000
            : undefined,
        };
        await this.persistToken();
        return { Authorization: `Bearer ${this.cachedToken.accessToken}` };
      } catch (error) {
        debugLogger.debug(
          `[OIDC] Refresh failed, falling back to interactive flow: ${getErrorMessage(error)}`,
        );
        // Clear stale credentials and fall through to interactive flow.
        await storage.deleteCredentials(this.agentName);
      }
    }

    // 3. No valid token → interactive browser-based auth.
    this.cachedToken = await this.authenticateInteractively();
    return { Authorization: `Bearer ${this.cachedToken.accessToken}` };
  }

  private async persistToken(): Promise<void> {
    if (!this.cachedToken) return;
    const storage = await this.getTokenStorage();
    await storage.setCredentials({
      serverName: this.agentName,
      token: this.cachedToken,
      updatedAt: Date.now(),
    });
  }

  private async authenticateInteractively(): Promise<OAuthToken> {
    await getConsentForOauth(this.agentName);

    const pkce = generatePKCEParams();
    const { port, response } = startCallbackServer(pkce.state);
    const callbackPort = await port;

    const authUrl = buildAuthorizationUrl(
      {
        clientId: this.config.client_id,
        authorizationUrl: this.endpoints.authorization_endpoint,
        tokenUrl: this.endpoints.token_endpoint,
        scopes: ['openid', ...(this.config.scopes || [])],
      },
      pkce,
      callbackPort,
    );

    await openBrowserSecurely(authUrl);
    const { code } = await response;

    const tokenResponse = await exchangeCodeForToken(
      {
        clientId: this.config.client_id,
        clientSecret: this.config.client_secret,
        authorizationUrl: this.endpoints.authorization_endpoint,
        tokenUrl: this.endpoints.token_endpoint,
      },
      code,
      pkce.codeVerifier,
      callbackPort,
    );

    // TODO: Verify ID token signature via jwks_uri and extract claims.
    // For now, we only use the access_token as a Bearer credential.

    this.cachedToken = {
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined,
    };

    await this.persistToken();
    return this.cachedToken;
  }
}
