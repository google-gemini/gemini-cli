/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTokenStorage } from './base.js';
import { FileTokenStorage } from './file.js';
import {
  ITokenStorage,
  MCPOAuthCredentials,
  TokenStorageType,
} from './types.js';

// Track if we've already logged the storage type globally
let globalStorageTypeLogged = false;

export class HybridTokenStorage extends BaseTokenStorage {
  private primaryStorage: ITokenStorage | null = null;
  private fallbackStorage: FileTokenStorage;
  private storageType: TokenStorageType | null = null;
  private storageInitPromise: Promise<ITokenStorage> | null = null;

  constructor(serviceName: string = 'gemini-cli-mcp-oauth') {
    super(serviceName);
    this.fallbackStorage = new FileTokenStorage(serviceName);
  }

  private async initializeStorage(): Promise<ITokenStorage> {
    const shouldLog = !globalStorageTypeLogged;

    if (process.env['GEMINI_FORCE_FILE_STORAGE'] === 'true') {
      if (shouldLog) {
        console.log(
          '📁 Using file-based token storage (forced by environment variable)',
        );
        globalStorageTypeLogged = true;
      }
      this.primaryStorage = this.fallbackStorage;
      this.storageType = TokenStorageType.FILE;
      return this.primaryStorage;
    }

    if (shouldLog) {
      console.log('🔐 Checking keychain availability...');
    }

    try {
      // Dynamically import KeychainTokenStorage to avoid initialization issues
      const { KeychainTokenStorage } = await import('./keychain.js');
      const keychainStorage = new KeychainTokenStorage(this.serviceName);

      const isAvailable = await keychainStorage.isAvailable();
      if (isAvailable) {
        if (shouldLog) {
          console.log(
            '✅ Keychain is available - using secure OS keychain for token storage',
          );
          globalStorageTypeLogged = true;
        }
        this.primaryStorage = keychainStorage;
        this.storageType = TokenStorageType.KEYCHAIN;
        return this.primaryStorage;
      } else {
        if (shouldLog) {
          console.log(
            '⚠️  Keychain not available - falling back to encrypted file storage',
          );
        }
      }
    } catch (error) {
      if (shouldLog) {
        console.log(
          '⚠️  Failed to initialize keychain - falling back to encrypted file storage',
        );
        console.debug('Keychain error details:', error);
      }
    }

    if (shouldLog) {
      console.log('📁 Using encrypted file-based token storage');
      globalStorageTypeLogged = true;
    }
    this.primaryStorage = this.fallbackStorage;
    this.storageType = TokenStorageType.ENCRYPTED_FILE;
    return this.primaryStorage;
  }

  private async getStorage(): Promise<ITokenStorage> {
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

  async getCredentials(
    serverName: string,
  ): Promise<MCPOAuthCredentials | null> {
    const storage = await this.getStorage();
    return storage.getCredentials(serverName);
  }

  async setCredentials(credentials: MCPOAuthCredentials): Promise<void> {
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

  async getAllCredentials(): Promise<Map<string, MCPOAuthCredentials>> {
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
