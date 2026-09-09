/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { MCPServerConfig } from '../config/config.js';
import { MCPOAuthProvider } from './oauth-provider.js';
import { FIVE_MIN_BUFFER_MS } from './oauth-utils.js';

export class DynamicStoredOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl = '';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Gemini CLI (Stored OAuth)',
    redirect_uris: [],
    grant_types: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
  };

  private clientInfo?: OAuthClientInformation;
  private readonly oauthProvider = new MCPOAuthProvider();
  private cachedToken?: OAuthTokens;
  private tokenExpiryTime?: number;

  constructor(
    private readonly serverName: string,
    private readonly serverConfig: MCPServerConfig,
  ) {}

  clientInformation(): OAuthClientInformation | undefined {
    return this.clientInfo;
  }

  saveClientInformation(clientInformation: OAuthClientInformation): void {
    this.clientInfo = clientInformation;
  }

  private isCachedTokenValid(): boolean {
    return !!(
      this.cachedToken?.access_token &&
      this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
    );
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (this.isCachedTokenValid()) {
      return this.cachedToken;
    }

    const oauthConfig =
      this.serverConfig.oauth?.enabled && this.serverConfig.oauth
        ? this.serverConfig.oauth
        : {};

    const tokenMeta = await this.oauthProvider.getValidTokenWithMetadata(
      this.serverName,
      oauthConfig,
    );

    if (!tokenMeta?.accessToken) {
      this.cachedToken = undefined;
      this.tokenExpiryTime = undefined;
      return undefined;
    }

    const freshTokens: OAuthTokens = {
      access_token: tokenMeta.accessToken,
      token_type: tokenMeta.tokenType || 'Bearer',
      expires_in: tokenMeta.expiresAt
        ? Math.max(0, Math.floor((tokenMeta.expiresAt - Date.now()) / 1000))
        : undefined,
      scope: tokenMeta.scope,
      refresh_token: tokenMeta.refreshToken,
    };

    if (freshTokens.expires_in !== undefined) {
      this.cachedToken = freshTokens;
      this.tokenExpiryTime = Date.now() + freshTokens.expires_in * 1000;
      return this.cachedToken;
    }

    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;
    return freshTokens;
  }

  saveTokens(_tokens: OAuthTokens): void {}
  redirectToAuthorization(_authorizationUrl: URL): void {}
  saveCodeVerifier(_codeVerifier: string): void {}
  codeVerifier(): string {
    return '';
  }
}
