/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpHeaders } from '@a2a-js/sdk/client';
import { BaseA2AAuthProvider } from './base-provider.js';
import type { HttpAuthConfig } from './types.js';
import { resolveAuthValue } from './value-resolver.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Authentication provider for HTTP authentication schemes.
 * Supports Bearer, Basic, and any IANA-registered scheme via raw value.
 */
export class HttpAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'http' as const;

  private resolvedToken?: string;
  private resolvedUsername?: string;
  private resolvedPassword?: string;
  private resolvedValue?: string;

  constructor(private readonly config: HttpAuthConfig) {
    super();
  }

  override async initialize(): Promise<void> {
    const config = this.config;
    if ('token' in config) {
      this.resolvedToken = await resolveAuthValue(config.token);
    } else if ('username' in config) {
      this.resolvedUsername = await resolveAuthValue(config.username);
      this.resolvedPassword = await resolveAuthValue(config.password);
    } else {
      // Generic raw value for any other IANA-registered scheme
      this.resolvedValue = await resolveAuthValue(config.value);
    }
    debugLogger.debug(
      `[HttpAuthProvider] Initialized with scheme: ${this.config.scheme}`,
    );
  }

  override async headers(): Promise<HttpHeaders> {
    const config = this.config;
    if ('token' in config) {
      if (!this.resolvedToken)
        throw new Error('HttpAuthProvider not initialized');
      return { Authorization: `Bearer ${this.resolvedToken}` };
    }

    if ('username' in config) {
      if (!this.resolvedUsername || !this.resolvedPassword) {
        throw new Error('HttpAuthProvider not initialized');
      }
      const credentials = Buffer.from(
        `${this.resolvedUsername}:${this.resolvedPassword}`,
      ).toString('base64');
      return { Authorization: `Basic ${credentials}` };
    }

    // Generic raw value for any other IANA-registered scheme
    if (!this.resolvedValue)
      throw new Error('HttpAuthProvider not initialized');
    return { Authorization: `${config.scheme} ${this.resolvedValue}` };
  }

  /**
   * Re-resolves credentials on auth failure (e.g. rotated tokens via $ENV or !command).
   */
  override async shouldRetryWithHeaders(
    req: RequestInit,
    res: Response,
  ): Promise<HttpHeaders | undefined> {
    if (res.status === 401 || res.status === 403) {
      debugLogger.debug(
        '[HttpAuthProvider] Re-resolving values after auth failure',
      );
      await this.initialize();
    }
    return super.shouldRetryWithHeaders(req, res);
  }
}
