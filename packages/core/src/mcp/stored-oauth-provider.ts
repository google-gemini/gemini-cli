/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { REDIRECT_PATH } from '../utils/oauth-flow.js';
import { coreEvents } from '../utils/events.js';
import { debugLogger } from '../utils/debugLogger.js';
import type { MCPOAuthConfig } from './oauth-provider.js';
import { MCPOAuthTokenStorage } from './oauth-token-storage.js';
import type { OAuthCredentials, OAuthToken } from './token-storage/types.js';
import type { McpAuthProvider } from './auth-provider.js';

const DEFAULT_REDIRECT_URL = `http://localhost${REDIRECT_PATH}`;

function toOAuthTokens(token: OAuthToken): OAuthTokens {
  const tokens: OAuthTokens = {
    access_token: token.accessToken,
    token_type: token.tokenType,
  };

  if (token.refreshToken) {
    tokens.refresh_token = token.refreshToken;
  }
  if (token.scope) {
    tokens.scope = token.scope;
  }
  if (token.expiresAt) {
    tokens.expires_in = Math.max(
      0,
      Math.floor((token.expiresAt - Date.now()) / 1000),
    );
  }

  return tokens;
}

function toStoredToken(
  tokens: OAuthTokens,
  previousToken?: OAuthToken,
): OAuthToken {
  const storedToken: OAuthToken = {
    accessToken: tokens.access_token,
    tokenType: tokens.token_type || previousToken?.tokenType || 'Bearer',
    refreshToken: tokens.refresh_token || previousToken?.refreshToken,
    scope: tokens.scope || previousToken?.scope,
  };

  if (tokens.expires_in !== undefined) {
    storedToken.expiresAt = Date.now() + tokens.expires_in * 1000;
  }

  return storedToken;
}

export class StoredOAuthMcpProvider implements McpAuthProvider {
  private cachedCredentials?: OAuthCredentials | null;
  private cachedClientInformation?: OAuthClientInformationMixed;
  private cachedCodeVerifier?: string;

  constructor(
    private readonly serverName: string,
    private readonly oauthConfig: MCPOAuthConfig = {},
    private readonly tokenStorage: MCPOAuthTokenStorage = new MCPOAuthTokenStorage(),
  ) {}

  get redirectUrl(): string {
    return this.oauthConfig.redirectUri || DEFAULT_REDIRECT_URL;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Gemini CLI MCP Client',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this.oauthConfig.clientSecret
        ? 'client_secret_post'
        : 'none',
      scope: this.oauthConfig.scopes?.join(' ') || undefined,
    };
  }

  private async getCredentials(): Promise<OAuthCredentials | null> {
    if (this.cachedCredentials !== undefined) {
      return this.cachedCredentials;
    }
    this.cachedCredentials = await this.tokenStorage.getCredentials(
      this.serverName,
    );
    return this.cachedCredentials;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    if (this.cachedClientInformation) {
      return this.cachedClientInformation;
    }

    const credentials = await this.getCredentials();
    const clientId = this.oauthConfig.clientId || credentials?.clientId;
    if (!clientId) {
      return undefined;
    }

    this.cachedClientInformation = {
      client_id: clientId,
      client_secret: this.oauthConfig.clientSecret,
      token_endpoint_auth_method: this.oauthConfig.clientSecret
        ? 'client_secret_post'
        : 'none',
    };
    return this.cachedClientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.cachedClientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const credentials = await this.getCredentials();
    if (!credentials) {
      return undefined;
    }
    return toOAuthTokens(credentials.token);
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    const credentials = await this.getCredentials();
    const clientId =
      this.oauthConfig.clientId ||
      credentials?.clientId ||
      this.cachedClientInformation?.client_id;

    await this.tokenStorage.saveToken(
      this.serverName,
      toStoredToken(tokens, credentials?.token),
      clientId,
      this.oauthConfig.tokenUrl || credentials?.tokenUrl,
      credentials?.mcpServerUrl,
    );

    this.cachedCredentials = await this.tokenStorage.getCredentials(
      this.serverName,
    );
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    debugLogger.log(
      `Stored OAuth provider for '${this.serverName}' needs re-authentication at ${authorizationUrl.toString()}`,
    );
    coreEvents.emitFeedback(
      'info',
      `MCP server '${this.serverName}' requires re-authentication using: /mcp auth ${this.serverName}`,
    );
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.cachedCodeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.cachedCodeVerifier) {
      throw new Error('No code verifier saved');
    }
    return this.cachedCodeVerifier;
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier',
  ): Promise<void> {
    if (scope === 'all' || scope === 'client' || scope === 'tokens') {
      await this.tokenStorage.deleteCredentials(this.serverName);
      this.cachedCredentials = null;
      if (scope === 'all' || scope === 'client') {
        this.cachedClientInformation = undefined;
      }
    }

    if (scope === 'all' || scope === 'verifier') {
      this.cachedCodeVerifier = undefined;
    }
  }
}
