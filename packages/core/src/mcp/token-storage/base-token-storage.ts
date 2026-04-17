/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TokenStorage, OAuthCredentials } from './types.js';

export abstract class BaseTokenStorage implements TokenStorage {
  protected readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  abstract getCredentials(serverName: string): Promise<OAuthCredentials | null>;
  abstract setCredentials(credentials: OAuthCredentials): Promise<void>;
  abstract deleteCredentials(serverName: string): Promise<void>;
  abstract listServers(): Promise<string[]>;
  abstract getAllCredentials(): Promise<Map<string, OAuthCredentials>>;
  abstract clearAll(): Promise<void>;

  protected validateCredentials(credentials: OAuthCredentials): void {
    if (!credentials.serverName) {
      throw new Error('Server name is required');
    }
    if (!credentials.token) {
      throw new Error('Token is required');
    }
    if (!credentials.token.accessToken) {
      throw new Error('Access token is required');
    }
    if (!credentials.token.tokenType) {
      throw new Error('Token type is required');
    }
  }

  protected isTokenExpired(credentials: OAuthCredentials): boolean {
    if (!credentials.token.expiresAt) {
      return false;
    }
    // If a refresh token exists, the caller (e.g. OAuth2Client) can silently
    // refresh the access token.  Discarding the credentials here would lose
    // the refresh token and force an interactive re-auth — which is fatal in
    // non-interactive / headless sessions (swarms, CI, -p flag).
    if (credentials.token.refreshToken) {
      return false;
    }
    const bufferMs = 5 * 60 * 1000;
    return Date.now() > credentials.token.expiresAt - bufferMs;
  }

  protected sanitizeServerName(serverName: string): string {
    return serverName.replace(/[^a-zA-Z0-9-_.]/g, '_');
  }
}
