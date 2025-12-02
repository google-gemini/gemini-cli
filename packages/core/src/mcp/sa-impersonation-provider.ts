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
import { OAuthUtils, FIVE_MIN_BUFFER_MS } from './oauth-utils.js';
import type { MCPServerConfig } from '../config/config.js';
import type { McpAuthProvider } from './auth-provider.js';
import { coreEvents } from '../utils/events.js';

function createIamApiUrl(targetSA: string): string {
  return `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(
    targetSA,
  )}:generateIdToken`;
}

export class ServiceAccountImpersonationProvider implements McpAuthProvider {
  private readonly targetServiceAccount: string;
  private readonly targetAudience: string; // OAuth Client Id
  private readonly auth: GoogleAuth;
  private cachedToken?: OAuthTokens;
  private tokenExpiryTime?: number;

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
    // 1. Check if we have a valid, non-expired cached token.
    if (
      this.cachedToken &&
      this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
    ) {
      return this.cachedToken;
    }

    // 2. Clear any invalid/expired cache.
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;

    // 3. Fetch a new ID token.
    const client = await this.auth.getClient();
    const url = createIamApiUrl(this.targetServiceAccount);

    let idToken: string;
    try {
      const res = await client.request<{ token: string }>({
        url,
        method: 'POST',
        data: {
          audience: this.targetAudience,
          includeEmail: true,
        },
      });
      idToken = res.data.token;

      if (!idToken || idToken.length === 0) {
        coreEvents.emitFeedback(
          'error',
          'Failed to obtain authentication token.',
        );
        return undefined;
      }
    } catch (e) {
      coreEvents.emitFeedback(
        'error',
        'Failed to obtain authentication token.',
        e as Error,
      );
      return undefined;
    }

    const expiryTime = OAuthUtils.parseTokenExpiry(idToken);
    // Note: We are placing the OIDC ID Token into the `access_token` field.
    // This is because the CLI uses this field to construct the
    // `Authorization: Bearer <token>` header, which is the correct way to
    // present an ID token.
    const newTokens: OAuthTokens = {
      access_token: idToken,
      token_type: 'Bearer',
    };

    if (expiryTime) {
      this.tokenExpiryTime = expiryTime;
      this.cachedToken = newTokens;
    }

    return newTokens;
  }

  saveTokens(_tokens: OAuthTokens): void {
    // No-op
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
