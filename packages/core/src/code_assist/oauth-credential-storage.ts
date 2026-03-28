/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Credentials } from 'google-auth-library';
import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import { OAUTH_FILE } from '../config/storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  GEMINI_CLI_HOME_ENV,
  GEMINI_CONFIG_DIR_ENV,
  GEMINI_DIR,
  getUserConfigDir,
  normalizePath,
  resolveToRealPath,
} from '../utils/paths.js';
import { coreEvents } from '../utils/events.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-oauth';
const MAIN_ACCOUNT_KEY = 'main-account';

export class OAuthCredentialStorage {
  private static storage: HybridTokenStorage = new HybridTokenStorage(
    KEYCHAIN_SERVICE_NAME,
  );

  /**
   * Load cached OAuth credentials
   */
  static async loadCredentials(): Promise<Credentials | null> {
    try {
      const credentials = await this.storage.getCredentials(MAIN_ACCOUNT_KEY);

      if (credentials?.token) {
        const { accessToken, refreshToken, expiresAt, tokenType, scope } =
          credentials.token;
        // Convert from OAuthCredentials format to Google Credentials format
        const googleCreds: Credentials = {
          access_token: accessToken,
          refresh_token: refreshToken || undefined,
          token_type: tokenType || undefined,
          scope: scope || undefined,
        };

        if (expiresAt) {
          googleCreds.expiry_date = expiresAt;
        }

        return googleCreds;
      }

      // Fallback: Try to migrate from old file-based storage
      return await this.migrateFromFileStorage();
    } catch (error: unknown) {
      coreEvents.emitFeedback(
        'error',
        'Failed to load OAuth credentials',
        error,
      );
      throw new Error('Failed to load OAuth credentials', { cause: error });
    }
  }

  /**
   * Save OAuth credentials
   */
  static async saveCredentials(credentials: Credentials): Promise<void> {
    if (!credentials.access_token) {
      throw new Error('Attempted to save credentials without an access token.');
    }

    // Convert Google Credentials to OAuthCredentials format
    const mcpCredentials: OAuthCredentials = {
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

    await this.storage.setCredentials(mcpCredentials);
  }

  /**
   * Clear cached OAuth credentials
   */
  static async clearCredentials(): Promise<void> {
    try {
      await this.storage.deleteCredentials(MAIN_ACCOUNT_KEY);

      for (const oldFilePath of this.getFileBasedCredentialCandidates()) {
        await fs.rm(oldFilePath, { force: true }).catch(() => {});
      }
    } catch (error: unknown) {
      coreEvents.emitFeedback(
        'error',
        'Failed to clear OAuth credentials',
        error,
      );
      throw new Error('Failed to clear OAuth credentials', { cause: error });
    }
  }

  /**
   * Migrate credentials from old file-based storage to keychain
   */
  private static async migrateFromFileStorage(): Promise<Credentials | null> {
    for (const oldFilePath of this.getFileBasedCredentialCandidates()) {
      let credsJson: string;
      try {
        credsJson = await fs.readFile(oldFilePath, 'utf-8');
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          continue;
        }
        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const credentials: Credentials = JSON.parse(credsJson);

      // Save to new storage
      await this.saveCredentials(credentials);

      // Remove old file after successful migration
      await fs.rm(oldFilePath, { force: true }).catch(() => {});

      return credentials;
    }

    return null;
  }

  private static getFileBasedCredentialCandidates(): string[] {
    const selectedDir = getUserConfigDir();
    const candidates = [path.join(selectedDir, OAUTH_FILE)];

    if (
      process.env[GEMINI_CLI_HOME_ENV] ||
      process.env[GEMINI_CONFIG_DIR_ENV]
    ) {
      return candidates;
    }

    const homeDir = os.homedir();
    if (!homeDir) {
      return candidates;
    }

    const legacyDir = path.join(homeDir, GEMINI_DIR);
    if (!this.isSameDirectory(selectedDir, legacyDir)) {
      candidates.push(path.join(legacyDir, OAUTH_FILE));
    }

    return candidates;
  }

  private static isSameDirectory(dirA: string, dirB: string): boolean {
    return (
      normalizePath(resolveToRealPath(dirA)) ===
      normalizePath(resolveToRealPath(dirB))
    );
  }
}
