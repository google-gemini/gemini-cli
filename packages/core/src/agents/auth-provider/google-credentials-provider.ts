/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpHeaders } from '@a2a-js/sdk/client';
import { BaseA2AAuthProvider } from './base-provider.js';
import type { GoogleCredentialsAuthConfig } from './types.js';
import { GoogleAuth } from 'google-auth-library';
import { debugLogger } from '../../utils/debugLogger.js';
import { OAuthUtils, FIVE_MIN_BUFFER_MS } from '../../mcp/oauth-utils.js';

const CLOUD_RUN_HOST_REGEX = /^(.*\.)?run\.app$/;
const ALLOWED_HOSTS = [/^.+\.googleapis\.com$/, CLOUD_RUN_HOST_REGEX];

/**
 * Authentication provider for Google ADC (Application Default Credentials).
 * Automatically decides whether to use identity tokens or access tokens
 * based on the target endpoint URL.
 */
export class GoogleCredentialsAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'google-credentials' as const;

  private readonly auth: GoogleAuth;
  private readonly useIdToken: boolean = false;
  private readonly audience?: string;
  private cachedToken?: string;
  private tokenExpiryTime?: number;

  constructor(
    private readonly config: GoogleCredentialsAuthConfig,
    targetUrl?: string,
  ) {
    super();

    if (!targetUrl) {
      throw new Error(
        'targetUrl must be provided to GoogleCredentialsAuthProvider to determine token audience.',
      );
    }

    const hostname = new URL(targetUrl).hostname;
    const isRunAppHost = CLOUD_RUN_HOST_REGEX.test(hostname);

    if (isRunAppHost) {
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

    // A2A spec requires scopes if configured, otherwise use default cloud-platform
    const scopes =
      this.config.scopes && this.config.scopes.length > 0
        ? this.config.scopes
        : ['https://www.googleapis.com/auth/cloud-platform'];

    this.auth = new GoogleAuth({
      scopes,
    });
  }

  override async initialize(): Promise<void> {
    // We can pre-fetch or validate if necessary here,
    // but deferred fetching is usually better for auth tokens.
  }

  async headers(): Promise<HttpHeaders> {
    // Check cache
    if (
      this.cachedToken &&
      this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime - FIVE_MIN_BUFFER_MS
    ) {
      return { Authorization: `Bearer ${this.cachedToken}` };
    }

    // Clear expired cache
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;

    if (this.useIdToken) {
      try {
        const idClient = await this.auth.getIdTokenClient(this.audience!);
        const idToken = await idClient.idTokenProvider.fetchIdToken(
          this.audience!,
        );

        const expiryTime = OAuthUtils.parseTokenExpiry(idToken);
        if (expiryTime) {
          this.tokenExpiryTime = expiryTime;
          this.cachedToken = idToken;
        }

        return { Authorization: `Bearer ${idToken}` };
      } catch (e) {
        const errorMessage = `Failed to get ADC ID token: ${
          e instanceof Error ? e.message : String(e)
        }`;
        debugLogger.error(errorMessage, e);
        throw new Error(errorMessage);
      }
    }

    // Otherwise, access token
    try {
      const client = await this.auth.getClient();
      const token = await client.getAccessToken();

      if (token.token) {
        this.cachedToken = token.token;
        // Use expiry_date from the underlying credentials if available.
        const creds = client.credentials;
        if (creds.expiry_date) {
          this.tokenExpiryTime = creds.expiry_date;
        }
        return { Authorization: `Bearer ${token.token}` };
      }
      throw new Error('Failed to retrieve ADC access token.');
    } catch (e) {
      const errorMessage = `Failed to get ADC access token: ${
        e instanceof Error ? e.message : String(e)
      }`;
      debugLogger.error(errorMessage, e);
      throw new Error(errorMessage);
    }
  }

  override async shouldRetryWithHeaders(
    _req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status !== 401 && res.status !== 403) {
      this.authRetryCount = 0;
      return undefined;
    }

    if (this.authRetryCount >= BaseA2AAuthProvider.MAX_AUTH_RETRIES) {
      return undefined;
    }
    this.authRetryCount++;

    debugLogger.debug(
      '[GoogleCredentialsAuthProvider] Re-fetching token after auth failure',
    );

    // Clear cache to force a re-fetch
    this.cachedToken = undefined;
    this.tokenExpiryTime = undefined;

    return this.headers();
  }
}
