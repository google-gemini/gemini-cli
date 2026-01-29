/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseA2AAuthProvider } from './base-provider.js';
import type { HttpAuthConfig, HttpHeaders } from './types.js';
import { resolveAuthValue, needsResolution } from './value-resolver.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Authentication provider for HTTP authentication (Bearer and Basic).
 *
 * Supports:
 * - Bearer token authentication
 * - Basic authentication (username/password)
 *
 * Credential values can be:
 * - Literal strings
 * - Environment variable references ($ENV_VAR)
 * - Shell commands (!command)
 */
export class HttpAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'http' as const;

  private resolvedCredentials: {
    token?: string;
    username?: string;
    password?: string;
  } = {};

  constructor(private readonly config: HttpAuthConfig) {
    super();
  }

  /**
   * Initialize the provider by resolving credential values.
   */
  override async initialize(): Promise<void> {
    if (this.config.scheme === 'Bearer') {
      if (!this.config.token) {
        throw new Error(
          'HTTP Bearer authentication requires a token. ' +
            'Add "token" to your auth configuration.',
        );
      }

      if (needsResolution(this.config.token)) {
        this.resolvedCredentials.token = await resolveAuthValue(
          this.config.token,
        );
        debugLogger.debug(
          `[HttpAuthProvider] Resolved Bearer token from: ${this.config.token.startsWith('$') ? 'env var' : 'command'}`,
        );
      } else {
        this.resolvedCredentials.token = this.config.token;
      }
    } else if (this.config.scheme === 'Basic') {
      if (!this.config.username || !this.config.password) {
        throw new Error(
          'HTTP Basic authentication requires username and password. ' +
            'Add "username" and "password" to your auth configuration.',
        );
      }

      // Resolve username
      if (needsResolution(this.config.username)) {
        this.resolvedCredentials.username = await resolveAuthValue(
          this.config.username,
        );
      } else {
        this.resolvedCredentials.username = this.config.username;
      }

      // Resolve password
      if (needsResolution(this.config.password)) {
        this.resolvedCredentials.password = await resolveAuthValue(
          this.config.password,
        );
      } else {
        this.resolvedCredentials.password = this.config.password;
      }

      debugLogger.debug('[HttpAuthProvider] Resolved Basic auth credentials');
    }
  }

  /**
   * Get the HTTP headers to include in requests.
   */
  async headers(): Promise<HttpHeaders> {
    if (this.config.scheme === 'Bearer') {
      if (!this.resolvedCredentials.token) {
        throw new Error(
          'HttpAuthProvider not initialized. Call initialize() first.',
        );
      }
      return { Authorization: `Bearer ${this.resolvedCredentials.token}` };
    }

    if (this.config.scheme === 'Basic') {
      const { username, password } = this.resolvedCredentials;
      if (!username || !password) {
        throw new Error(
          'HttpAuthProvider not initialized. Call initialize() first.',
        );
      }

      // Base64 encode the credentials
      const credentials = `${username}:${password}`;
      const encoded = Buffer.from(credentials, 'utf-8').toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    throw new Error(`Unsupported HTTP auth scheme: ${this.config.scheme}`);
  }

  /**
   * For Bearer tokens that may expire, re-resolve the token on retry.
   * This is useful when using shell commands that fetch fresh tokens.
   */
  override async shouldRetryWithHeaders(
    _req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status !== 401 && res.status !== 403) {
      return undefined;
    }

    // For Bearer tokens from commands, re-resolve to get a fresh token
    if (
      this.config.scheme === 'Bearer' &&
      this.config.token &&
      this.config.token.startsWith('!')
    ) {
      debugLogger.debug(
        '[HttpAuthProvider] Re-resolving Bearer token after auth failure',
      );
      this.resolvedCredentials.token = await resolveAuthValue(
        this.config.token,
      );
      return this.headers();
    }

    // For other cases, just return the same headers
    return this.headers();
  }
}
