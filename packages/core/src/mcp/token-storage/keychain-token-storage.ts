/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials, SecretStorage } from './types.js';
import { coreEvents } from '../../utils/events.js';
import {
  KeystoreService,
  KEYCHAIN_TEST_PREFIX,
} from '../../services/keystore.js';

const SECRET_PREFIX = '__secret__';

export class KeychainTokenStorage
  extends BaseTokenStorage
  implements SecretStorage
{
  private keystoreService: KeystoreService;

  constructor(serviceName: string) {
    super(serviceName);
    this.keystoreService = new KeystoreService(serviceName);
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const data = await this.keystoreService.getPassword(
      this.sanitizeServerName(serverName),
    );

    if (!data) {
      return null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const credentials = JSON.parse(data) as OAuthCredentials;

      if (this.isTokenExpired(credentials)) {
        return null;
      }

      return credentials;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse stored credentials for ${serverName}`);
      }
      throw error;
    }
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    this.validateCredentials(credentials);

    const sanitizedName = this.sanitizeServerName(credentials.serverName);
    const updatedCredentials: OAuthCredentials = {
      ...credentials,
      updatedAt: Date.now(),
    };

    const data = JSON.stringify(updatedCredentials);
    await this.keystoreService.setPassword(sanitizedName, data);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    const sanitizedName = this.sanitizeServerName(serverName);
    const deleted = await this.keystoreService.deletePassword(sanitizedName);

    if (!deleted) {
      throw new Error(`No credentials found for ${serverName}`);
    }
  }

  async listServers(): Promise<string[]> {
    try {
      const credentials = await this.keystoreService.listCredentials();
      return credentials
        .filter(
          (cred) =>
            !cred.account.startsWith(KEYCHAIN_TEST_PREFIX) &&
            !cred.account.startsWith(SECRET_PREFIX),
        )
        .map((cred) => cred.account);
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        'Failed to list servers from keychain',
        error,
      );
      return [];
    }
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const result = new Map<string, OAuthCredentials>();
    try {
      const credentials = (await this.keystoreService.listCredentials()).filter(
        (c) =>
          !c.account.startsWith(KEYCHAIN_TEST_PREFIX) &&
          !c.account.startsWith(SECRET_PREFIX),
      );

      for (const cred of credentials) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          const data = JSON.parse(cred.password) as OAuthCredentials;
          if (!this.isTokenExpired(data)) {
            result.set(cred.account, data);
          }
        } catch (error) {
          coreEvents.emitFeedback(
            'error',
            `Failed to parse credentials for ${cred.account}`,
            error,
          );
        }
      }
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        'Failed to get all credentials from keychain',
        error,
      );
    }

    return result;
  }

  async clearAll(): Promise<void> {
    const servers = await this.keystoreService
      .listCredentials()
      .then((creds) => creds.map((c) => c.account))
      .catch((error: Error) => {
        throw new Error(
          `Failed to list servers for clearing: ${error.message}`,
        );
      });

    const errors: Error[] = [];

    for (const server of servers) {
      try {
        await this.deleteCredentials(server);
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to clear some credentials: ${errors.map((e) => e.message).join(', ')}`,
      );
    }
  }

  // Checks whether or not a set-get-delete cycle with the keychain works.
  // Returns false if any operation fails.
  async checkKeychainAvailability(): Promise<boolean> {
    return this.keystoreService.isAvailable();
  }

  async isAvailable(): Promise<boolean> {
    return this.keystoreService.isAvailable();
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.keystoreService.setPassword(`${SECRET_PREFIX}${key}`, value);
  }

  async getSecret(key: string): Promise<string | null> {
    return this.keystoreService.getPassword(`${SECRET_PREFIX}${key}`);
  }

  async deleteSecret(key: string): Promise<void> {
    const deleted = await this.keystoreService.deletePassword(
      `${SECRET_PREFIX}${key}`,
    );
    if (!deleted) {
      throw new Error(`No secret found for key: ${key}`);
    }
  }

  async listSecrets(): Promise<string[]> {
    try {
      const credentials = await this.keystoreService.listCredentials();
      return credentials
        .filter((cred) => cred.account.startsWith(SECRET_PREFIX))
        .map((cred) => cred.account.substring(SECRET_PREFIX.length));
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        'Failed to list secrets from keychain',
        error,
      );
      return [];
    }
  }
}
