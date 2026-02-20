/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpHeaders } from '@a2a-js/sdk/client';
import { BaseA2AAuthProvider } from './base-provider.js';
import type { ApiKeyAuthConfig } from './types.js';
import { resolveAuthValue, needsResolution } from './value-resolver.js';
import { debugLogger } from '../../utils/debugLogger.js';

const DEFAULT_HEADER_NAME = 'X-API-Key';

/**
 * Authentication provider for API Key authentication.
 * Sends the API key as an HTTP header.
 *
 * The API key value can be:
 * - A literal string
 * - An environment variable reference ($ENV_VAR)
 * - A shell command (!command)
 */
export class ApiKeyAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'apiKey' as const;

  private resolvedKey: string | undefined;
  private readonly headerName: string;

  constructor(private readonly config: ApiKeyAuthConfig) {
    super();
    this.headerName = config.name ?? DEFAULT_HEADER_NAME;
  }

  override async initialize(): Promise<void> {
    if (needsResolution(this.config.key)) {
      this.resolvedKey = await resolveAuthValue(this.config.key);
      debugLogger.debug(
        `[ApiKeyAuthProvider] Resolved API key from: ${this.config.key.startsWith('$') ? 'env var' : 'command'}`,
      );
    } else {
      this.resolvedKey = this.config.key;
    }
  }

  async headers(): Promise<HttpHeaders> {
    if (!this.resolvedKey) {
      throw new Error(
        'ApiKeyAuthProvider not initialized. Call initialize() first.',
      );
    }
    return { [this.headerName]: this.resolvedKey };
  }

  /**
   * Re-resolve command-based API keys on auth failure.
   */
  override async shouldRetryWithHeaders(
    _req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status !== 401 && res.status !== 403) {
      this.authRetryCount = 0;
      return undefined;
    }

    // Only retry for command-based keys that may resolve to a new value.
    // Literal and env-var keys would just resend the same failing headers.
    if (!this.config.key.startsWith('!') || this.config.key.startsWith('!!')) {
      return undefined;
    }

    if (this.authRetryCount >= BaseA2AAuthProvider.MAX_AUTH_RETRIES) {
      return undefined;
    }
    this.authRetryCount++;

    debugLogger.debug(
      '[ApiKeyAuthProvider] Re-resolving API key after auth failure',
    );
    this.resolvedKey = await resolveAuthValue(this.config.key);

    return this.headers();
  }
}
