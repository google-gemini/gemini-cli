/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials } from 'google-auth-library';
import { HybridTokenStorage } from '../mcp/token-storage/hybrid.js';
import { MCPOAuthCredentials } from '../mcp/token-storage/types.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

const GEMINI_DIR = '.gemini';
const CREDENTIAL_FILENAME = 'oauth_creds.json';
const KEYCHAIN_SERVICE_NAME = 'gemini-cli-oauth';
const MAIN_ACCOUNT_KEY = 'main-account';

export class OAuthCredentialStorage {
  private static storage: HybridTokenStorage | null = null;

  private static getStorage(): HybridTokenStorage {
    if (!this.storage) {
      this.storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);
    }
    return this.storage;
  }

  /**
   * Load cached OAuth credentials
   */
  static async loadCredentials(): Promise<Credentials | null> {
    try {
      const storage = this.getStorage();
      const credentials = await storage.getCredentials(MAIN_ACCOUNT_KEY);

      if (credentials && credentials.token) {
        // Convert from MCPOAuthCredentials format to Google Credentials format
        const googleCreds: Credentials = {
          access_token: credentials.token.accessToken,
          refresh_token: credentials.token.refreshToken || undefined,
          token_type: credentials.token.tokenType || undefined,
          scope: credentials.token.scope || undefined,
        };

        if (credentials.token.expiresAt) {
          googleCreds.expiry_date = credentials.token.expiresAt;
        }

        return googleCreds;
      }

      // Fallback: Try to migrate from old file-based storage
      return await this.migrateFromFileStorage();
    } catch (error) {
      console.debug('Failed to load OAuth credentials:', error);
      return null;
    }
  }

  /**
   * Save OAuth credentials
   */
  static async saveCredentials(credentials: Credentials): Promise<void> {
    if (!credentials.access_token) {
      throw new Error('Attempted to save credentials without an access token.');
    }

    const storage = this.getStorage();

    // Convert Google Credentials to MCPOAuthCredentials format
    const mcpCredentials: MCPOAuthCredentials = {
      serverName: MAIN_ACCOUNT_KEY,
      token: {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || undefined,
        tokenType: credentials.token_type || 'Bearer',
        scope: credentials.scope || undefined,
        expiresAt: credentials.expiry_date || undefined,
      },
      updatedAt: Date.now(),
    };

    await storage.setCredentials(mcpCredentials);
  }

  /**
   * Clear cached OAuth credentials
   */
  static async clearCredentials(): Promise<void> {
    try {
      const storage = this.getStorage();
      await storage.deleteCredentials(MAIN_ACCOUNT_KEY);

      // Also try to remove the old file if it exists
      const oldFilePath = path.join(
        os.homedir(),
        GEMINI_DIR,
        CREDENTIAL_FILENAME,
      );
      await fs.rm(oldFilePath, { force: true }).catch(() => {});
    } catch (error) {
      console.debug('Failed to clear OAuth credentials:', error);
    }
  }

  /**
   * Migrate credentials from old file-based storage to keychain
   */
  private static async migrateFromFileStorage(): Promise<Credentials | null> {
    try {
      const oldFilePath = path.join(
        os.homedir(),
        GEMINI_DIR,
        CREDENTIAL_FILENAME,
      );
      const credsJson = await fs.readFile(oldFilePath, 'utf-8');
      const credentials = JSON.parse(credsJson) as Credentials;

      // Save to new storage
      await this.saveCredentials(credentials);

      // Remove old file after successful migration
      await fs.rm(oldFilePath, { force: true }).catch(() => {});

      console.log(
        '✅ Successfully migrated OAuth credentials to secure storage',
      );

      return credentials;
    } catch {
      // No old credentials to migrate
      return null;
    }
  }
}
