/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { GoogleAuth } from 'google-auth-library';
import type { MCPServerConfig } from '../config/config.js';
import { OAuthUtils, FIVE_MIN_BUFFER_MS } from './oauth-utils.js';

const CLOUD_RUN_HOST_REGEX = /^(.*\.)?run\.app$/;

// An array of hosts that are allowed to use the Google Credential provider.
const ALLOWED_HOSTS = [/^.+\.googleapis\.com$/, /^(.*\.)?luci\.app$/];

export class GoogleCredentialProvider implements OAuthClientProvider {
  private readonly auth: GoogleAuth;
  private readonly useIdToken: boolean = false;
  private readonly audience?: string;
  private cachedToken?: OAuthTokens;
  private tokenExpiryTime?: number;

  // Properties required by OAuthClientProvider, with no-op values
  readonly redirectUrl = '';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Gemini CLI (Google ADC)',
    redirect_uris: [],
    grant_types: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
  };
  private _clientInformation?: OAuthClientInformationFull;

  constructor(private readonly config?: MCPServerConfig) {
    const url = this.config?.url || this.config?.httpUrl;
    if (!url) {
      throw new Error(
        'URL must be provided in the config for Google Credentials provider',
      );
    }

    const hostname = new URL(url).hostname;
    const isRunAppHost = CLOUD_RUN_HOST_REGEX.test(hostname);
    if (!this.config?.allow_unscoped_id_tokens_cloud_run && isRunAppHost) {
      throw new Error(
        `To enable the Cloud Run MCP Server at ${url} please set allow_unscoped_id_tokens_cloud_run:true in the MCP Server config.`,
      );
    }
    if (this.config?.allow_unscoped_id_tokens_cloud_run && isRunAppHost) {
      this.useIdToken = true;
    }
    this.audience = hostname;

    if (
      !this.useIdToken &&
      !ALLOWED_HOSTS.some((pattern) => pattern.test(hostname))
    ) {
      throw new Error(
        `Host "${hostname}" is not an allowed host for Google Credential provider.`,
      );
    }

    // If we are using the access token flow, we MUST have scopes.
    if (!this.useIdToken && !this.config?.oauth?.scopes) {
      throw new Error(
        'Scopes must be provided in the oauth config for Google Credentials provider (or enable allow_unscoped_id_tokens_for_cloud_run to use ID tokens for Cloud Run endpoints)',
      );
    }

    this.auth = new GoogleAuth({
      scopes: this.config?.oauth?.scopes,
    });
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    // check for a valid, non-expired cached token.
    if (
      this.cachedToken &&
      this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
    ) {
      return this.cachedToken;
    }

    // Clear invalid/expired cache.
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;

    // If allow_unscoped_id_tokens_for_cloud_run is configured, use ID tokens.
    if (this.useIdToken) {
      try {
        const idClient = await this.auth.getIdTokenClient(this.audience!);
        const idToken = await idClient.idTokenProvider.fetchIdToken(
          this.audience!,
        );

        const newToken: OAuthTokens = {
          access_token: idToken,
          token_type: 'Bearer',
        };

        const expiryTime = OAuthUtils.parseTokenExpiry(idToken);
        if (expiryTime) {
          this.tokenExpiryTime = expiryTime;
          this.cachedToken = newToken;
        }
        return newToken;
      } catch (e) {
        console.error('Failed to get ID token from Google ADC', e);
        return undefined;
      }
    }

    const client = await this.auth.getClient();
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse.token) {
      console.error('Failed to get access token from Google ADC');
      return undefined;
    }

    const newToken: OAuthTokens = {
      access_token: accessTokenResponse.token,
      token_type: 'Bearer',
    };

    const expiryTime = client.credentials?.expiry_date;
    if (expiryTime) {
      this.tokenExpiryTime = expiryTime;
      this.cachedToken = newToken;
    }

    return newToken;
  }

  saveTokens(_tokens: OAuthTokens): void {
    // No-op, ADC manages tokens.
  }

  redirectToAuthorization(_authorizationUrl: URL): void {
    // No-op
  }

  saveCodeVerifier(_codeVerifier: string): void {
    // No-op
  }

  codeVerifier(): string {
    // No-op
    return '';
  }
}
