/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileSecretStorage } from './file-secret-storage.js';
import type { SecretStorage } from './types.js';

const FORCE_FILE_STORAGE_ENV_VAR = 'GEMINI_FORCE_FILE_STORAGE';

/**
 * A secret storage implementation that attempts to use the system keychain
 * first, falling back to an encrypted local file if the keychain is
 * unavailable or fails to initialize.
 */
export class HybridSecretStorage implements SecretStorage {
  private storage: SecretStorage | null = null;
  private storageInitPromise: Promise<SecretStorage> | null = null;
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private async initializeStorage(): Promise<SecretStorage> {
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
          return this.storage;
        }
      } catch (_e) {
        // Fallback to file storage if keychain fails to initialize
      }
    }

    this.storage = new FileSecretStorage(this.serviceName);
    return this.storage;
  }

  private async getStorage(): Promise<SecretStorage> {
    if (this.storage !== null) {
      return this.storage;
    }

    if (!this.storageInitPromise) {
      this.storageInitPromise = this.initializeStorage();
    }

    return this.storageInitPromise;
  }

  async setSecret(key: string, value: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.setSecret(key, value);
  }

  async getSecret(key: string): Promise<string | null> {
    const storage = await this.getStorage();
    return storage.getSecret(key);
  }

  async deleteSecret(key: string): Promise<void> {
    const storage = await this.getStorage();
    await storage.deleteSecret(key);
  }

  async listSecrets(): Promise<string[]> {
    const storage = await this.getStorage();
    return storage.listSecrets();
  }

  async isAvailable(): Promise<boolean> {
    // Hybrid storage is always available because it can fall back to file
    return true;
  }
}
