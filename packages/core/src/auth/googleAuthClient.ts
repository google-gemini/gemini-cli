/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import { AuthClient } from './authClient.js';

/**
 * An implementation of AuthClient that uses google-auth-library
 * to obtain and refresh authentication headers.
 */
export class GoogleAuthClient implements AuthClient {
  private auth: GoogleAuth;

  constructor() {
    this.auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/userinfo.email',
    });
  }

  async getHeaders(): Promise<Record<string, string>> {
    const client = await this.auth.getClient();
    if (!client) {
      throw new Error('Failed to get GoogleAuth client.');
    }
    const headers = (await client.getRequestHeaders()) as unknown as Record<
      string,
      string
    >;
    return headers;
  }
}
