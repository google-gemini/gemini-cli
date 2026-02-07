/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpHeaders } from '@a2a-js/sdk/client';
import type { A2AAuthProvider, A2AAuthProviderType } from './types.js';

/**
 * Abstract base class for A2A authentication providers.
 */
export abstract class BaseA2AAuthProvider implements A2AAuthProvider {
  abstract readonly type: A2AAuthProviderType;
  abstract headers(): Promise<HttpHeaders>;

  private static readonly MAX_AUTH_RETRIES = 2;
  private authRetryCount = 0;

  /**
   * Default: retry on 401/403 with fresh headers.
   * Subclasses with cached tokens must override to force-refresh to avoid infinite retries.
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
    // Reset on success
    this.authRetryCount = 0;
    return undefined;
  }

  async initialize(): Promise<void> {}
}
