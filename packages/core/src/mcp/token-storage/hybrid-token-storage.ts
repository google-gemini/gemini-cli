/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTokenStorage } from './base-token-storage.js';
import { FileTokenStorage } from './file-token-storage.js';
import type { TokenStorage, OAuthCredentials } from './types.js';
import { TokenStorageType } from './types.js';

const FORCE_FILE_STORAGE_ENV_VAR = 'GEMINI_FORCE_FILE_STORAGE';

export class HybridTokenStorage extends BaseTokenStorage {
  private storage: TokenStorage | null = null;
  private storageType: TokenStorageType | null = null;
  private storageInitPromise: Promise<TokenStorage> | null = null;

  constructor(serviceName: string) {
    super(serviceName);
  }

  private async initializeStorage(): Promise<TokenStorage> {
    const forceFileStorage = process.env[FORCE_FILE_STORAGE_ENV_VAR] === 'true';

    if (!forceFileStorage) {
      try {
        const { KeychainTokenStorage } = await import(
          './keychain-token-storage.js'
        );
        const keychainStorage = new KeychainTokenStorage(this.serviceName);

        const isAvailable = await keychainStorage.isAvailable();
        if (isAvailable) {
          this.storage = keychainStorage;
          this.storageType = TokenStorageType.KEYCHAIN;
          return this.storage;
        }
      } catch (_e) {
        // Fallback to file storage if keychain fails to initialize
      }
    }

    this.storage = new FileTokenStorage(this.serviceName);
    this.storageType = TokenStorageType.ENCRYPTED_FILE;
    return this.storage;
  }

  private async getStorage(): Promise<TokenStorage> {
    if (this.storage !== null) {
      return this.storage;
    }

    // Use a single initialization promise to avoid race conditions
    if (!this.storageInitPromise) {
      this.storageInitPromise = this.initializeStorage();
    }

    // Wait for initialization to complete
    return await this.storageInitPromise;
  }

  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    const storage = await this.getStorage();
    return storage.getCredentials(serverName);
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    const storage = await this.getStorage();
    await storage.setCredentials(credentials);
  }

  async deleteCredentials(serverName: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteCredentials(serverName);
  }

  async listServers(): Promise<string[]> {
    const storage = await this.getStorage();
    return storage.listServers();
  }

  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    const storage = await this.getStorage();
    return storage.getAllCredentials();
  }

  async clearAll(): Promise<void> {
    const storage = await this.getStorage();
    await storage.clearAll();
  }

  async getStorageType(): Promise<TokenStorageType> {
    await this.getStorage();
    return this.storageType!;
  }
}
