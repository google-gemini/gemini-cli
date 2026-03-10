/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials, SecretStorage } from './types.js';
import { coreEvents } from '../../utils/events.js';
import { KeychainService } from '../../services/keychainService.js';
import {
  KEYCHAIN_TEST_PREFIX,
  SECRET_PREFIX,
} from '../../services/keychainTypes.js';

export class KeychainTokenStorage
  extends BaseTokenStorage
  implements SecretStorage
{
  private readonly keychainService: KeychainService;

  constructor(serviceName: string) {
    super(serviceName);
    this.keychainService = new KeychainService(serviceName);
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    try {
      const sanitizedName = this.sanitizeServerName(serverName);
      const data = await this.keychainService.getPassword(sanitizedName);

      if (!data) {
        return null;
      }

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
    await this.keychainService.setPassword(sanitizedName, data);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    const sanitizedName = this.sanitizeServerName(serverName);
    const deleted = await this.keychainService.deletePassword(sanitizedName);

    if (!deleted) {
      throw new Error(`No credentials found for ${serverName}`);
    }
  }

  async listServers(): Promise<string[]> {
    try {
      const credentials = await this.keychainService.findCredentials();
      return credentials
        .filter(
          (cred) =>
            !cred.account.startsWith(KEYCHAIN_TEST_PREFIX) &&
            !cred.account.startsWith(SECRET_PREFIX),
        )
        .map((cred: { account: string }) => cred.account);
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
      const credentials = (await this.keychainService.findCredentials()).filter(
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
    try {
      const credentials = await this.keychainService.findCredentials();
      const errors: Error[] = [];

      for (const cred of credentials) {
        try {
          await this.deleteCredentials(cred.account);
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
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        'Failed to clear credentials from keychain',
        error,
      );
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.keychainService.isAvailable();
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.keychainService.setPassword(`${SECRET_PREFIX}${key}`, value);
  }

  async getSecret(key: string): Promise<string | null> {
    return this.keychainService.getPassword(`${SECRET_PREFIX}${key}`);
  }

  async deleteSecret(key: string): Promise<void> {
    const deleted = await this.keychainService.deletePassword(
      `${SECRET_PREFIX}${key}`,
    );
    if (!deleted) {
      throw new Error(`No secret found for key: ${key}`);
    }
  }

  async listSecrets(): Promise<string[]> {
    try {
      const credentials = await this.keychainService.findCredentials();
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
