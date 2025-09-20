/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { GoogleAuth } from 'google-auth-library';
import type { MCPServerConfig } from '../config/config.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';

function createIamApiUrl(targetSA: string): string {
  return `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(targetSA)}:generateIdToken`;
}

export class ServiceAccountImpersonationProvider
  implements OAuthClientProvider
{
  private readonly targetServiceAccount: string;
  private readonly targetAudience: string; // OAuth Client Id
  private readonly auth: GoogleAuth;

  // Properties required by OAuthClientProvider, with no-op values
  readonly redirectUrl = '';
  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Gemini CLI (Service Account Impersonation)',
    redirect_uris: [],
    grant_types: [],
    response_types: [],
    token_endpoint_auth_method: 'none',
  };
  private _clientInformation?: OAuthClientInformationFull;

  constructor(private readonly config: MCPServerConfig) {
    // This check is done in mcp-client.ts. This is just an additional check.
    if (!this.config.httpUrl && !this.config.url) {
      throw new Error(
        'A url or httpUrl must be provided for the Service Account Impersonation provider',
      );
    }

    if (!config.targetAudience) {
      throw new Error(
        'targetAudience must be provided for the Service Account Impersonation provider',
      );
    }
    this.targetAudience = config.targetAudience;

    if (!config.targetServiceAccount) {
      throw new Error(
        'targetServiceAccount must be provided for the Service Account Impersonation provider',
      );
    }
    this.targetServiceAccount = config.targetServiceAccount;

    this.auth = new GoogleAuth();
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this._clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationFull): void {
    this._clientInformation = clientInformation;
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    // Note: We are placing the OIDC ID Token into the `access_token` field.
    // This is because the CLI uses this field to construct the
    // `Authorization: Bearer <token>` header, which is the correct way to
    // present an ID token.
    const client = await this.auth.getClient();
    const url = createIamApiUrl(this.targetServiceAccount);

    const res = await client.request<{ token: string }>({
      url,
      method: 'POST',
      data: {
        audience: this.targetAudience,
        includeEmail: true,
      },
    });
    const idToken = res.data.token;

    if (!idToken || idToken.length === 0) {
      console.error('Failed to get ID token from Google');
      return undefined;
    }

    const tokens: OAuthTokens = {
      access_token: idToken,
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
