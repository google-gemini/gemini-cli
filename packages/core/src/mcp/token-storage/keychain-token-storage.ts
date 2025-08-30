/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { BaseTokenStorage } from './base-token-storage.js';
import type { OAuthCredentials } from './types.js';

interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(
    service: string,
  ): Promise<Array<{ account: string; password: string }>>;
}

export class KeychainTokenStorage extends BaseTokenStorage {
  private keychainAvailable: boolean | null = null;
  private keytarModule: Keytar | null = null;
  private keytarLoadAttempted = false;

  async getKeytar(): Promise<Keytar | null> {
    // If we've already tried loading (successfully or not), return the result
    if (this.keytarLoadAttempted) {
      return this.keytarModule;
    }

    this.keytarLoadAttempted = true;

    try {
      // Try to import keytar without any timeout - let the OS handle it
      const moduleName = 'keytar';
      const module = await import(moduleName);
      this.keytarModule = module.default || module;
    } catch (error) {
      console.error(error);
    }
    return this.keytarModule;
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    if (!(await this.checkKeychainAvailability())) {
      throw new Error('Keychain is not available');
    }

    const keytar = this.keytarModule;
    if (!keytar) {
      throw new Error('Keytar module not available');
    }

    try {
      const sanitizedName = this.sanitizeServerName(serverName);
      const data = await keytar.getPassword(this.serviceName, sanitizedName);

      if (!data) {
        return null;
      }

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
    if (!(await this.checkKeychainAvailability())) {
      throw new Error('Keychain is not available');
    }

    const keytar = this.keytarModule;
    if (!keytar) {
      throw new Error('Keytar module not available');
    }

    this.validateCredentials(credentials);

    const sanitizedName = this.sanitizeServerName(credentials.serverName);
    const updatedCredentials: OAuthCredentials = {
      ...credentials,
      updatedAt: Date.now(),
    };

    const data = JSON.stringify(updatedCredentials);
    await keytar.setPassword(this.serviceName, sanitizedName, data);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    if (!(await this.checkKeychainAvailability())) {
      throw new Error('Keychain is not available');
    }

    const keytar = this.keytarModule;
    if (!keytar) {
      throw new Error('Keytar module not available');
    }

    const sanitizedName = this.sanitizeServerName(serverName);
    const deleted = await keytar.deletePassword(
      this.serviceName,
      sanitizedName,
    );

    if (!deleted) {
      throw new Error(`No credentials found for ${serverName}`);
    }
  }

  async listServers(): Promise<string[]> {
    if (!(await this.checkKeychainAvailability())) {
      return [];
    }

    const keytar = this.keytarModule;
    if (!keytar) {
      return [];
    }

    try {
      const credentials = await keytar.findCredentials(this.serviceName);
      return credentials.map((cred: { account: string }) => cred.account);
    } catch (error) {
      console.error('Failed to list servers from keychain:', error);
      return [];
    }
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const result = new Map<string, OAuthCredentials>();

    if (!(await this.checkKeychainAvailability())) {
      return result;
    }

    const keytar = this.keytarModule;
    if (!keytar) {
      return result;
    }

    try {
      const credentials = await keytar.findCredentials(this.serviceName);

      for (const cred of credentials) {
        try {
          const data = JSON.parse(cred.password) as OAuthCredentials;
          if (!this.isTokenExpired(data)) {
            result.set(cred.account, data);
          }
        } catch (error) {
          console.error(
            `Failed to parse credentials for ${cred.account}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error('Failed to get all credentials from keychain:', error);
    }

    return result;
  }

  async clearAll(): Promise<void> {
    if (!(await this.checkKeychainAvailability())) {
      throw new Error('Keychain is not available');
    }

    const servers = await this.listServers();
    const errors: Error[] = [];

    for (const server of servers) {
      try {
        await this.deleteCredentials(server);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to clear some credentials: ${errors.map((e) => e.message).join(', ')}`,
      );
    }
  }

  async checkKeychainAvailability(): Promise<boolean> {
    if (this.keychainAvailable !== null) {
      return this.keychainAvailable;
    }

    try {
      const keytar = await this.getKeytar();
      if (!keytar) {
        this.keychainAvailable = false;
        return false;
      }

      const testAccount = `__keychain_test__${crypto.randomBytes(8).toString('hex')}`;
      const testPassword = 'test';

      await keytar.setPassword(this.serviceName, testAccount, testPassword);
      const retrieved = await keytar.getPassword(this.serviceName, testAccount);
      await keytar.deletePassword(this.serviceName, testAccount);

      const success = retrieved === testPassword;
      this.keychainAvailable = success;
      return success;
    } catch (_error) {
      this.keychainAvailable = false;
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.checkKeychainAvailability();
  }
}
