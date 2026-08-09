/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpHeaders } from '@a2a-js/sdk/client';
import type { A2AAuthProvider, A2AAuthProviderType } from './types.js';

/**
 * Abstract base class for A2A authentication providers.
 * Provides default implementations for optional methods.
 */
export abstract class BaseA2AAuthProvider implements A2AAuthProvider {
  /**
   * The type of authentication provider.
   */
  abstract readonly type: A2AAuthProviderType;

  /**
   * Get the HTTP headers to include in requests.
   * Subclasses must implement this method.
   */
  abstract headers(): Promise<HttpHeaders>;

  protected static readonly MAX_AUTH_RETRIES = 2;
  protected authRetryCount = 0;

  /**
   * Check if a request should be retried with new headers.
   *
   * The default implementation checks for 401/403 status codes and
   * returns fresh headers for retry. Subclasses can override for
   * custom retry logic.
   *
   * @param _req The original request init
   * @param res The response from the server
   * @returns New headers for retry, or undefined if no retry should be made
   */
  async shouldRetryWithHeaders(
    _req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status === 401 || res.status === 403) {
      if (this.authRetryCount >= BaseA2AAuthProvider.MAX_AUTH_RETRIES) {
        return undefined; // Max retries exceeded
      }
      this.authRetryCount++;
      return this.headers();
    }
    // Reset count if not an auth error
    this.authRetryCount = 0;
    return undefined;
  }

  /**
   * Initialize the provider. Override in subclasses that need async setup.
   */
  async initialize(): Promise<void> {
    // Default: no-op
  }
}
