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

const ALLOWED_HOSTS = [/^.+\.googleapis\.com$/, /^(.*\.)?luci\.app$/];

export class GoogleCredentialProvider implements OAuthClientProvider {
  private readonly auth: GoogleAuth;

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
    if (!ALLOWED_HOSTS.some((pattern) => pattern.test(hostname))) {
      throw new Error(
        `Host "${hostname}" is not an allowed host for Google Credential provider.`,
      );
    }

    const scopes = this.config?.oauth?.scopes;
    if (!scopes || scopes.length === 0) {
      throw new Error(
        'Scopes must be provided in the oauth config for Google Credentials provider',
      );
    }
    this.auth = new GoogleAuth({
      scopes,
    });
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const client = await this.auth.getClient();
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse.token) {
      console.error('Failed to get access token from Google ADC');
      return undefined;
    }

    const tokens: OAuthTokens = {
      access_token: accessTokenResponse.token,
      token_type: 'Bearer',
    };
    return tokens;
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
