/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { McpAuthProvider } from './auth-provider.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { GoogleAuth } from 'google-auth-library';
import type { MCPServerConfig } from '../config/config.js';
import { FIVE_MIN_BUFFER_MS } from './oauth-utils.js';
import { coreEvents } from '../utils/events.js';

const ALLOWED_HOSTS = [/^.+\.googleapis\.com$/, /^(.*\.)?luci\.app$/];

export class GoogleCredentialProvider implements McpAuthProvider {
  private readonly auth: GoogleAuth;
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

    const client = await this.auth.getClient();
    const accessTokenResponse = await client.getAccessToken();

    if (!accessTokenResponse.token) {
      coreEvents.emitFeedback(
        'error',
        'Failed to get access token from Google ADC',
      );
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
  /**
   * Returns the project ID used for quota.
   */
  async getQuotaProjectId(): Promise<string | undefined> {
    const client = await this.auth.getClient();
    return client.quotaProjectId;
  }

  /**
   * Returns custom headers to be added to the request.
   */
  async getRequestHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    const configHeaders = this.config?.headers ?? {};
    const userProjectHeaderKey = Object.keys(configHeaders).find(
      (key) => key.toLowerCase() === 'x-goog-user-project',
    );

    // If the header is present in the config (case-insensitive check), use the
    // config's key and value. This prevents duplicate headers (e.g.
    // 'x-goog-user-project' and 'X-Goog-User-Project') which can cause errors.
    if (userProjectHeaderKey) {
      headers[userProjectHeaderKey] = configHeaders[userProjectHeaderKey];
    } else {
      const quotaProjectId = await this.getQuotaProjectId();
      if (quotaProjectId) {
        headers['X-Goog-User-Project'] = quotaProjectId;
      }
    }
    return headers;
  }
}
