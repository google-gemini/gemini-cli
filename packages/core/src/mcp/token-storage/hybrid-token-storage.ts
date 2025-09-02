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
  private primaryStorage: TokenStorage | null = null;
  private fallbackStorage: FileTokenStorage;
  private storageType: TokenStorageType | null = null;
  private storageInitPromise: Promise<TokenStorage> | null = null;

  constructor(serviceName: string = 'gemini-cli-mcp-oauth') {
    super(serviceName);
    this.fallbackStorage = new FileTokenStorage(serviceName);
  }

  private async initializeStorage(): Promise<TokenStorage> {
    if (process.env[FORCE_FILE_STORAGE_ENV_VAR] === 'true') {
      this.primaryStorage = this.fallbackStorage;
      this.storageType = TokenStorageType.ENCRYPTED_FILE;
      return this.primaryStorage;
    }

    // Dynamically import KeychainTokenStorage to avoid initialization issues
    try {
      const { KeychainTokenStorage } = await import(
        './keychain-token-storage.js'
      );
      const keychainStorage = new KeychainTokenStorage(this.serviceName);

      const isAvailable = await keychainStorage.isAvailable();
      if (isAvailable) {
        this.primaryStorage = keychainStorage;
        this.storageType = TokenStorageType.KEYCHAIN;
        return this.primaryStorage;
      }
    } catch (_e) {
      // Fallback to file storage if keychain fails to initialize
    }

    this.primaryStorage = this.fallbackStorage;
    this.storageType = TokenStorageType.ENCRYPTED_FILE;
    return this.primaryStorage;
  }

  private async getStorage(): Promise<TokenStorage> {
    if (this.primaryStorage !== null) {
      return this.primaryStorage;
    }

    // Use a single initialization promise to avoid race conditions
    if (!this.storageInitPromise) {
      this.storageInitPromise = this.initializeStorage();
    }

    // Wait for initialization to complete
    const storage = await this.storageInitPromise;
    return storage;
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

  async resetStorage(): Promise<void> {
    this.primaryStorage = null;
    this.storageType = null;
    this.storageInitPromise = null;
  }
}
