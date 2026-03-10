/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  homedir,
  GEMINI_DIR,
  type ExtensionInstallMetadata,
  KeychainService,
  isNodeError,
} from '@google/gemini-cli-core';
import {
  INTEGRITY_FILENAME,
  INTEGRITY_KEY_FILENAME,
  KEYCHAIN_SERVICE_NAME,
  SECRET_KEY_ACCOUNT,
} from './variables.js';
import { z } from 'zod';
import stableStringify from 'json-stable-stringify';

const ExtensionIntegrityDataSchema = z.object({
  hash: z.string(),
  signature: z.string(),
});

const ExtensionIntegrityMapSchema = z.record(
  z.string(),
  ExtensionIntegrityDataSchema,
);

const IntegrityStoreSchema = z.object({
  store: ExtensionIntegrityMapSchema,
  signature: z.string(),
});

/**
 * The integrity data for a single extension.
 */
export type ExtensionIntegrityData = z.infer<
  typeof ExtensionIntegrityDataSchema
>;

/**
 * A map of extension names to their corresponding integrity data.
 */
export type ExtensionIntegrityMap = z.infer<typeof ExtensionIntegrityMapSchema>;

/**
 * The full structure of the integrity store as persisted on disk,
 * including the map of extension data and a master signature covering the map.
 */
export type IntegrityStore = z.infer<typeof IntegrityStoreSchema>;

export enum IntegrityDataStatus {
  VERIFIED = 'verified',
  MISSING = 'missing',
  INVALID = 'invalid',
}

/**
 * Manages the integrity of installed extensions by cryptographically signing
 * their installation metadata.
 *
 * This prevents malicious processes or extensions from tampering with the
 * update source of other extensions. It uses an OS-level secure keychain
 * to protect the signing key, falling back to a local file with restricted
 * permissions if no keychain is available.
 */
export class ExtensionIntegrityManager {
  private readonly integrityStorePath: string;
  private readonly fallbackKeyPath: string;
  private readonly keychainService: KeychainService;
  private cachedSecretKey: string | null = null;

  constructor() {
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.integrityStorePath = path.join(configDir, INTEGRITY_FILENAME);
    this.fallbackKeyPath = path.join(configDir, INTEGRITY_KEY_FILENAME);
    this.keychainService = new KeychainService(KEYCHAIN_SERVICE_NAME);
  }

  /**
   * Verifies that the current extension metadata matches the previously
   * recorded integrity data in the store.
   *
   * @returns IntegrityDataStatus indicating the result of the verification.
   */
  async verifyExtensionIntegrity(
    extensionName: string,
    metadata: ExtensionInstallMetadata | undefined,
  ): Promise<IntegrityDataStatus> {
    if (!metadata) {
      return IntegrityDataStatus.MISSING;
    }

    try {
      // Load and verify the centralized store first
      const store = await this.loadAndVerifyIntegrityStore();

      if (!store[extensionName]) {
        return IntegrityDataStatus.MISSING;
      }

      // Verify that the current metadata's hash matches the recorded hash
      const integrity = store[extensionName];
      const actualHash = this.generateHash(metadata);
      const expectedHash = integrity.hash;

      if (!this.verifyConstantTime(actualHash, expectedHash)) {
        return IntegrityDataStatus.INVALID;
      }

      // Verify that the recorded signature matches the current hash
      // This ensures that the recorded hash itself was not modified
      // (even though the store signature also covers this).
      const actualSignature = integrity.signature;
      const expectedSignature = await this.generateSignature(actualHash);

      const isAuthentic = this.verifyConstantTime(
        actualSignature,
        expectedSignature,
      );

      return isAuthentic
        ? IntegrityDataStatus.VERIFIED
        : IntegrityDataStatus.INVALID;
    } catch (_) {
      // If we cannot load or verify the store, we treat the extension as unverified.
      return IntegrityDataStatus.INVALID;
    }
  }

  /**
   * Calculates and persists the integrity data for an extension in the
   * centralized integrity store.
   */
  async storeExtensionIntegrity(
    extensionName: string,
    metadata: ExtensionInstallMetadata,
  ): Promise<void> {
    // Generate integrity for the new metadata
    const integrity = await this.generateExtensionIntegrity(metadata);

    // Load and verify existing store
    const store = await this.loadAndVerifyIntegrityStore();

    // Update entry in the map
    store[extensionName] = integrity;

    // Save the entire store with a new signature
    await this.writeIntegrityStore(store);
  }

  /**
   * Generates integrity data (hash and signature) for specific extension metadata.
   */
  async generateExtensionIntegrity(
    metadata: ExtensionInstallMetadata,
  ): Promise<ExtensionIntegrityData> {
    const hash = this.generateHash(metadata);
    const signature = await this.generateSignature(hash);
    return { hash, signature };
  }

  /**
   * Retrieves the master secret key used for signing metadata.
   * Generates a new random key if one does not already exist.
   * Caches the key in memory after the first successful retrieval.
   */
  async getSecretKey(): Promise<string> {
    if (this.cachedSecretKey) {
      return this.cachedSecretKey;
    }

    if (await this.keychainService.isAvailable()) {
      this.cachedSecretKey = await this.getSecretKeyFromKeychain();
    } else {
      this.cachedSecretKey = await this.getSecretKeyFromFile();
    }

    return this.cachedSecretKey;
  }

  /**
   * Retrieves the secret key from the OS keychain, generating and storing
   * it if it does not already exist.
   */
  private async getSecretKeyFromKeychain(): Promise<string> {
    let key = await this.keychainService.getPassword(SECRET_KEY_ACCOUNT);
    if (!key) {
      key = randomBytes(32).toString('hex');
      await this.keychainService.setPassword(SECRET_KEY_ACCOUNT, key);
    }
    return key;
  }

  /**
   * Retrieves the secret key from a restricted fallback file, generating
   * and storing it if it does not already exist.
   */
  private async getSecretKeyFromFile(): Promise<string> {
    try {
      const key = await fs.promises.readFile(this.fallbackKeyPath, 'utf-8');
      return key.trim();
    } catch (e) {
      if (this.isNotFoundError(e)) {
        const key = randomBytes(32).toString('hex');
        await fs.promises.writeFile(this.fallbackKeyPath, key, { mode: 0o600 });
        return key;
      }
      throw e;
    }
  }

  /**
   * Loads the integrity store from disk and verifies its signature.
   * @returns The verified integrity map, or an empty object if the store doesn't exist.
   * @throws Error if the store signature is invalid or parsing fails.
   */
  private async loadAndVerifyIntegrityStore(): Promise<ExtensionIntegrityMap> {
    let content: string;
    try {
      content = await fs.promises.readFile(this.integrityStorePath, 'utf-8');
    } catch (e) {
      if (this.isNotFoundError(e)) {
        return {};
      }
      throw e;
    }

    let rawStore: IntegrityStore;
    try {
      rawStore = IntegrityStoreSchema.parse(JSON.parse(content));
    } catch (e) {
      throw new Error(
        `Failed to parse extension integrity store: ${e instanceof Error ? e.message : 'Unknown error'}`,
      );
    }

    const { store, signature: actualSignature } = rawStore;

    // Verify that the store has not been modified by checking its own signature
    const storeContent = stableStringify(store) ?? '';
    const expectedSignature = await this.generateSignature(storeContent);

    if (!this.verifyConstantTime(actualSignature, expectedSignature)) {
      throw new Error('Extension integrity store cannot be verified');
    }

    return store;
  }

  /**
   * Persists the integrity store to disk with a fresh signature.
   */
  private async writeIntegrityStore(
    store: ExtensionIntegrityMap,
  ): Promise<void> {
    const storeContent = stableStringify(store) ?? '';
    const storeSignature = await this.generateSignature(storeContent);

    const finalData: IntegrityStore = {
      store,
      signature: storeSignature,
    };

    await fs.promises.writeFile(
      this.integrityStorePath,
      JSON.stringify(finalData, null, 2),
    );
  }

  /**
   * Generates a SHA-256 hash of the metadata using a stable string representation.
   */
  private generateHash(metadata: ExtensionInstallMetadata): string {
    const content = stableStringify(metadata) ?? '';
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generates an HMAC-SHA256 signature for the given data using the secret key.
   */
  private async generateSignature(data: string): Promise<string> {
    const secretKey = await this.getSecretKey();
    return createHmac('sha256', secretKey).update(data).digest('hex');
  }

  /**
   * Performs a constant-time comparison of two hex strings to prevent timing attacks.
   * Safely handles inputs of different lengths by returning false early.
   */
  private verifyConstantTime(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  /**
   * Returns true if the error indicates that a file or directory was not found.
   */
  private isNotFoundError(error: unknown): boolean {
    return isNodeError(error) && error.code === 'ENOENT';
  }
}
