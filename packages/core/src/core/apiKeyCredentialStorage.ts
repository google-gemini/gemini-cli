/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';
const DEFAULT_API_KEY_ENTRY = 'default-api-key';

export class ApiKeyCredentialStorage {
  private static storage: HybridTokenStorage = new HybridTokenStorage(
    KEYCHAIN_SERVICE_NAME,
  );

  /**
   * Load cached API key
   */
  static async loadApiKey(): Promise<string | null> {
    try {
      const credentials = await this.storage.getCredentials(
        DEFAULT_API_KEY_ENTRY,
      );

      if (credentials?.token?.accessToken) {
        return credentials.token.accessToken;
      }

      return null;
    } catch (error: unknown) {
      // Log error but don't crash, just return null so user can re-enter key
      console.error('Failed to load API key from storage:', error);
      return null;
    }
  }

  /**
   * Save API key
   */
  static async saveApiKey(apiKey: string | null | undefined): Promise<void> {
    if (!apiKey || apiKey.trim() === '') {
      await this.storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
      return;
    }

    // Wrap API key in OAuthCredentials format as required by HybridTokenStorage
    const credentials: OAuthCredentials = {
      serverName: DEFAULT_API_KEY_ENTRY,
      token: {
        accessToken: apiKey,
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    };

    await this.storage.setCredentials(credentials);
  }

  /**
   * Clear cached API key
   */
  static async clearApiKey(): Promise<void> {
    try {
      await this.storage.deleteCredentials(DEFAULT_API_KEY_ENTRY);
    } catch (error: unknown) {
      console.error('Failed to clear API key from storage:', error);
      throw new Error('Failed to clear API key');
    }
  }
}
