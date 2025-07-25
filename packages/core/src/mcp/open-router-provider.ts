/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { MCPServerConfig } from '../config/config.js';

export class OpenRouterProvider implements OAuthClientProvider {
  // Properties required by OAuthClientProvider, with no-op values
  readonly redirectUrl = '';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Gemini CLI (OpenRouter)',
    redirect_uris: [],
    grant_types: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
  };
  private _clientInformation?: OAuthClientInformationFull;

  constructor(private readonly config?: MCPServerConfig) {
    if (!this.config?.apiKey) {
      throw new Error('API key must be provided for OpenRouter provider');
    }
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return {
      access_token: this.config!.apiKey!,
      token_type: 'Bearer',
    };
  }

  saveTokens(_tokens: OAuthTokens): void {
    // No-op, API key is static.
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
