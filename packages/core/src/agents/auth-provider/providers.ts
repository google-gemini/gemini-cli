/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ApiKeyAuthConfig, HttpAuthConfig } from './types.js';
import { BaseA2AAuthProvider } from './base-provider.js';
import { resolveAuthValue } from './value-resolver.js';

/**
 * API Key authentication provider.
 * Supports sending the API key in header, query, or cookie.
 */
export class ApiKeyAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'apiKey' as const;

  private readonly key: string;
  private readonly location: 'header' | 'query' | 'cookie';
  private readonly name: string;
  private cachedKey?: string;

  constructor(
    config: ApiKeyAuthConfig,
    defaults: {
      location?: 'header' | 'query' | 'cookie';
      name?: string;
    } = {},
  ) {
    super();
    this.key = config.key;
    this.location = config.location ?? defaults.location ?? 'header';
    this.name = config.name ?? defaults.name ?? 'X-API-Key';
  }

  override async initialize(): Promise<void> {
    try {
      this.cachedKey = await resolveAuthValue(this.key);
    } catch (error) {
      throw new Error(
        `Failed to resolve API key: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async headers(): Promise<Record<string, string>> {
    if (!this.cachedKey) {
      await this.initialize();
    }

    if (this.location === 'header') {
      return { [this.name]: this.cachedKey! };
    }

    // For query or cookie location, we return empty headers
    // The transport layer will handle the actual placement
    return {};
  }

  /**
   * Get query parameters for API key authentication.
   */
  getQueryParams(): Record<string, string> {
    if (!this.cachedKey) {
      throw new Error(
        'ApiKeyAuthProvider not initialized. Call initialize() first.',
      );
    }

    if (this.location === 'query') {
      return { [this.name]: this.cachedKey };
    }
    return {};
  }

  /**
   * Get cookie string for API key authentication.
   */
  getCookie(): string | undefined {
    if (!this.cachedKey) {
      throw new Error(
        'ApiKeyAuthProvider not initialized. Call initialize() first.',
      );
    }

    if (this.location === 'cookie') {
      return `${this.name}=${this.cachedKey}`;
    }
    return undefined;
  }
}

/**
 * HTTP authentication provider (Bearer or Basic).
 */
export class HttpAuthProvider extends BaseA2AAuthProvider {
  readonly type = 'http' as const;

  private readonly scheme: 'Bearer' | 'Basic';
  private readonly token?: string;
  private readonly username?: string;
  private readonly password?: string;
  private cachedToken?: string;

  constructor(config: HttpAuthConfig) {
    super();
    this.scheme = config.scheme;
    if (config.scheme === 'Bearer') {
      this.token = config.token;
    } else {
      this.username = config.username;
      this.password = config.password;
    }
  }

  override async initialize(): Promise<void> {
    try {
      if (this.scheme === 'Bearer' && this.token) {
        this.cachedToken = await resolveAuthValue(this.token);
      } else if (this.scheme === 'Basic') {
        const resolvedUsername = this.username
          ? await resolveAuthValue(this.username)
          : '';
        const resolvedPassword = this.password
          ? await resolveAuthValue(this.password)
          : '';
        // Basic auth uses base64 encoding
        const credentials = `${resolvedUsername}:${resolvedPassword}`;
        const base64Credentials = Buffer.from(credentials).toString('base64');
        this.cachedToken = base64Credentials;
      }
    } catch (error) {
      throw new Error(
        `Failed to resolve HTTP credentials: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async headers(): Promise<Record<string, string>> {
    if (!this.cachedToken) {
      await this.initialize();
    }

    if (this.scheme === 'Bearer') {
      return { Authorization: `Bearer ${this.cachedToken!}` };
    } else {
      // Basic
      return { Authorization: `Basic ${this.cachedToken!}` };
    }
  }
}
