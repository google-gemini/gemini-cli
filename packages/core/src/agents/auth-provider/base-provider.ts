/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  A2AAuthProvider,
  A2AAuthProviderType,
  HttpHeaders,
} from './types.js';

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
    // Retry on authentication errors
    if (res.status === 401 || res.status === 403) {
      return this.headers();
    }
    return undefined;
  }

  /**
   * Initialize the provider. Override in subclasses that need async setup.
   */
  async initialize(): Promise<void> {
    // Default: no-op
  }

  /**
   * Clean up resources. Override in subclasses that need cleanup.
   */
  async dispose(): Promise<void> {
    // Default: no-op
  }
}
