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
  KeystoreService,
} from '@google/gemini-cli-core';
import { INTEGRITY_FILENAME, INTEGRITY_KEY_FILENAME } from './variables.js';
import { z } from 'zod';
import stableStringify from 'json-stable-stringify';

const IntegrityDataSchema = z.object({
  hash: z.string(),
  signature: z.string(),
});

const IntegrityStoreSchema = z.record(z.string(), IntegrityDataSchema);

const IntegrityStoreFileSchema = z.object({
  store: IntegrityStoreSchema,
  signature: z.string(),
});

const KEYSTORE_SERVICE_NAME = 'gemini-cli-extension-integrity';
const SECRET_KEY_ACCOUNT = 'secret-key';

export type IntegrityData = z.infer<typeof IntegrityDataSchema>;
export type ExtensionIntegrityStore = z.infer<typeof IntegrityStoreSchema>;
export type IntegrityStoreFile = z.infer<typeof IntegrityStoreFileSchema>;

export enum IntegrityStatus {
  AUTHENTIC = 'authentic',
  NOT_FOUND = 'not_found',
  TAMPERED = 'tampered',
}

/**
 * Manages the integrity of installed extensions by cryptographically signing
 * their installation metadata.
 *
 * This prevents malicious processes or extensions from tampering with the
 * update source of other extensions. It uses an OS-level secure keystore
 * to protect the signing key, falling back to a local file with restricted
 * permissions if no keystore is available.
 */
export class ExtensionIntegrityManager {
  private integrityFilePath: string;
  private fallbackKeyPath: string;
  private keystoreService: KeystoreService;

  constructor() {
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.integrityFilePath = path.join(configDir, INTEGRITY_FILENAME);
    this.fallbackKeyPath = path.join(configDir, INTEGRITY_KEY_FILENAME);
    this.keystoreService = new KeystoreService(KEYSTORE_SERVICE_NAME);
  }

  /**
   * Retrieves the master secret key used for signing metadata.
   * Generates a new random key if one does not already exist.
   */
  async getSecretKey(): Promise<string> {
    if (await this.keystoreService.isAvailable()) {
      let key = await this.keystoreService.getPassword(SECRET_KEY_ACCOUNT);
      if (!key) {
        key = randomBytes(32).toString('hex');
        await this.keystoreService.setPassword(SECRET_KEY_ACCOUNT, key);
      }
      return key;
    }

    // Fallback to file-based storage if OS keystore is unavailable
    if (fs.existsSync(this.fallbackKeyPath)) {
      return fs.readFileSync(this.fallbackKeyPath, 'utf-8').trim();
    }

    const key = randomBytes(32).toString('hex');
    fs.writeFileSync(this.fallbackKeyPath, key, { mode: 0o600 });
    return key;
  }

  /**
   * Generates integrity data (SHA-256 hash and HMAC signature) for the
   * given extension metadata.
   */
  async generateIntegrity(
    metadata: ExtensionInstallMetadata,
  ): Promise<IntegrityData> {
    const content = stableStringify(metadata);
    const hash = createHash('sha256').update(content).digest('hex');
    const secretKey = await this.getSecretKey();
    const signature = createHmac('sha256', secretKey)
      .update(hash)
      .digest('hex');
    return { hash, signature };
  }

  /**
   * Calculates and persists the integrity data for an extension in the
   * centralized integrity store. The store itself is also signed to
   * prevent tampering with the integrity records.
   */
  async storeIntegrity(
    extensionName: string,
    metadata: ExtensionInstallMetadata,
  ): Promise<void> {
    const integrity = await this.generateIntegrity(metadata);

    let store: ExtensionIntegrityStore = {};
    if (fs.existsSync(this.integrityFilePath)) {
      try {
        const content = fs.readFileSync(this.integrityFilePath, 'utf-8');
        const data = IntegrityStoreFileSchema.parse(JSON.parse(content));
        store = data.store || {};
      } catch (e) {
        // Fail-closed: If the existing integrity store is corrupted, we must not
        // silently ignore it and start fresh, as that could allow an attacker
        // to overwrite existing legitimate signatures with a new key.
        throw new Error(
          `Failed to parse extension integrity store: ${e instanceof Error ? e.message : 'Unknown error'}. ` +
            'The integrity store may be corrupted or tampered with.',
        );
      }
    }

    store[extensionName] = integrity;

    const secretKey = await this.getSecretKey();
    const storeContent = stableStringify(store);
    const storeSignature = createHmac('sha256', secretKey)
      .update(storeContent)
      .digest('hex');

    const finalData: IntegrityStoreFile = {
      store,
      signature: storeSignature,
    };

    fs.writeFileSync(
      this.integrityFilePath,
      JSON.stringify(finalData, null, 2),
    );
  }

  /**
   * Verifies that the current extension metadata matches the previously
   * recorded integrity data.
   *
   * @throws Error if the centralized integrity store signature is invalid.
   * @returns IntegrityStatus indicating the result of the verification.
   */
  async verifyIntegrity(
    extensionName: string,
    metadata: ExtensionInstallMetadata | undefined,
  ): Promise<IntegrityStatus> {
    if (!metadata) {
      return IntegrityStatus.NOT_FOUND;
    }

    if (!fs.existsSync(this.integrityFilePath)) {
      return IntegrityStatus.NOT_FOUND;
    }

    try {
      const content = fs.readFileSync(this.integrityFilePath, 'utf-8');
      const data = IntegrityStoreFileSchema.parse(JSON.parse(content));
      const { store, signature } = data;

      if (!store || !signature || !store[extensionName]) {
        return IntegrityStatus.NOT_FOUND;
      }

      const secretKey = await this.getSecretKey();

      // 1. Verify that the integrity store itself hasn't been modified
      const expectedStoreSignature = createHmac('sha256', secretKey)
        .update(stableStringify(store))
        .digest('hex');

      if (
        !timingSafeEqual(
          Buffer.from(signature, 'hex'),
          Buffer.from(expectedStoreSignature, 'hex'),
        )
      ) {
        throw new Error('Extension integrity store has been tampered with!');
      }

      // 2. Verify that the extension's metadata matches its recorded signature
      const integrity = store[extensionName];
      const metadataContent = stableStringify(metadata);
      const currentHash = createHash('sha256')
        .update(metadataContent)
        .digest('hex');

      if (
        !timingSafeEqual(
          Buffer.from(currentHash, 'hex'),
          Buffer.from(integrity.hash, 'hex'),
        )
      ) {
        return IntegrityStatus.TAMPERED;
      }

      const expectedSignature = createHmac('sha256', secretKey)
        .update(currentHash)
        .digest('hex');

      const isAuthentic = timingSafeEqual(
        Buffer.from(integrity.signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );

      return isAuthentic ? IntegrityStatus.AUTHENTIC : IntegrityStatus.TAMPERED;
    } catch (e) {
      if (
        e instanceof Error &&
        e.message === 'Extension integrity store has been tampered with!'
      ) {
        throw e;
      }
      return IntegrityStatus.TAMPERED;
    }
  }
}
