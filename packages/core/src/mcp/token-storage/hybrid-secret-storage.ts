/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeychainTokenStorage } from './keychain-token-storage.js';
import { EncryptedFileSecretStorage } from './encrypted-file-secret-storage.js';
import type { SecretStorage } from './types.js';

export class HybridSecretStorage implements SecretStorage {
  private storage: SecretStorage | null = null;
  private storageInitPromise: Promise<SecretStorage> | null = null;
  private readonly serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private async initializeStorage(): Promise<SecretStorage> {
    const keychainStorage = new KeychainTokenStorage(this.serviceName);
    const isAvailable = await keychainStorage.isAvailable();
    if (isAvailable) {
      this.storage = keychainStorage;
    } else {
      this.storage = new EncryptedFileSecretStorage(this.serviceName);
    }
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
}
