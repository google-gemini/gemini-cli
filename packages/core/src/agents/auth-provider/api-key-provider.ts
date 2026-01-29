/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseA2AAuthProvider } from './base-provider.js';
import type { ApiKeyAuthConfig, HttpHeaders } from './types.js';
import { resolveAuthValue, needsResolution } from './value-resolver.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Default header name for API Key authentication.
 */
const DEFAULT_HEADER_NAME = 'X-API-Key';

/**
 * Default query/cookie parameter name for API Key authentication.
 */
const DEFAULT_PARAM_NAME = 'api_key';

/**
 * Authentication provider for API Key authentication.
 *
 * Supports sending the API key in:
 * - HTTP headers (default)
 * - Query parameters
 * - Cookies
 *
 * The API key value can be:
 * - A literal string
 * - An environment variable reference ($ENV_VAR)
 * - A shell command (!command)
 */
export class ApiKeyAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'apiKey' as const;

  private resolvedKey: string | undefined;
  private readonly keyLocation: 'header' | 'query' | 'cookie';
  private readonly keyName: string;

  constructor(private readonly config: ApiKeyAuthConfig) {
    super();
    this.keyLocation = config.in ?? 'header';
    this.keyName =
      config.name ??
      (this.keyLocation === 'header'
        ? DEFAULT_HEADER_NAME
        : DEFAULT_PARAM_NAME);
  }

  /**
   * Initialize the provider by resolving the API key value.
   */
  override async initialize(): Promise<void> {
    // Only resolve dynamic values once during initialization
    // to avoid repeated command execution
    if (needsResolution(this.config.key)) {
      this.resolvedKey = await resolveAuthValue(this.config.key);
      debugLogger.debug(
        `[ApiKeyAuthProvider] Resolved API key from: ${this.config.key.startsWith('$') ? 'env var' : 'command'}`,
      );
    } else {
      this.resolvedKey = this.config.key;
    }

    // Warn about unsupported locations once during init
    if (this.keyLocation === 'query') {
      debugLogger.warn(
        `[ApiKeyAuthProvider] API key location 'query' is not fully supported. ` +
          `Consider using 'header' instead.`,
      );
    } else if (this.keyLocation === 'cookie') {
      debugLogger.warn(
        `[ApiKeyAuthProvider] API key location 'cookie' is not fully supported. ` +
          `Consider using 'header' instead.`,
      );
    }
  }

  /**
   * Get the HTTP headers to include in requests.
   *
   * For API keys in headers, this returns the header directly.
   * For query/cookie locations, this returns an empty object
   * (the query/cookie handling would need to be done at a different layer).
   */
  async headers(): Promise<HttpHeaders> {
    if (!this.resolvedKey) {
      throw new Error(
        'ApiKeyAuthProvider not initialized. Call initialize() first.',
      );
    }

    if (this.keyLocation === 'header') {
      return { [this.keyName]: this.resolvedKey };
    }

    // For query and cookie, we can't set headers directly.
    // The SDK's transport layer would need to handle these.
    return {};
  }

  /**
   * Re-resolve command-based API keys on auth failure.
   * This handles cases where the key may have expired or been rotated.
   */
  override async shouldRetryWithHeaders(
    _req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status !== 401 && res.status !== 403) {
      return undefined;
    }

    // For command-based keys, re-resolve to get a fresh key
    if (this.config.key.startsWith('!')) {
      debugLogger.debug(
        '[ApiKeyAuthProvider] Re-resolving API key after auth failure',
      );
      this.resolvedKey = await resolveAuthValue(this.config.key);
    }

    return this.headers();
  }

  /**
   * Get the API key value for use in query parameters.
   * This is exposed for transport layers that need to add query params.
   */
  getKeyForQuery(): { name: string; value: string } | undefined {
    if (this.keyLocation !== 'query' || !this.resolvedKey) {
      return undefined;
    }
    return { name: this.keyName, value: this.resolvedKey };
  }

  /**
   * Get the API key value for use in cookies.
   * This is exposed for transport layers that need to set cookies.
   */
  getKeyForCookie(): { name: string; value: string } | undefined {
    if (this.keyLocation !== 'cookie' || !this.resolvedKey) {
      return undefined;
    }
    return { name: this.keyName, value: this.resolvedKey };
  }
}
