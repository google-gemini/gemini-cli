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
  INTEGRITY_FILENAME,
  INTEGRITY_KEY_FILENAME,
  KEYCHAIN_SERVICE_NAME,
  SECRET_KEY_ACCOUNT,
} from '../constants.js';
import { type ExtensionInstallMetadata } from '../config.js';
import { KeychainService } from '../../services/keychainService.js';
import { isNodeError, getErrorMessage } from '../../utils/errors.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { homedir, GEMINI_DIR } from '../../utils/paths.js';
import stableStringify from 'json-stable-stringify';
import {
  type IExtensionIntegrity,
  IntegrityDataStatus,
  type ExtensionIntegrityMap,
  type IntegrityStore,
  IntegrityStoreSchema,
} from './integrityTypes.js';

export * from './integrityTypes.js';

/**
 * Manages the secret key used for signing integrity data.
 * Attempts to use the OS keychain, falling back to a restricted local file.
 * @internal
 */
class IntegrityKeyManager {
  private readonly fallbackKeyPath: string;
  private readonly keychainService: KeychainService;
  private cachedSecretKey: string | null = null;

  constructor() {
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.fallbackKeyPath = path.join(configDir, INTEGRITY_KEY_FILENAME);
    this.keychainService = new KeychainService(KEYCHAIN_SERVICE_NAME);
  }

  /**
   * Retrieves or generates the master secret key.
   */
  async getSecretKey(): Promise<string> {
    if (this.cachedSecretKey) {
      return this.cachedSecretKey;
    }

    if (await this.keychainService.isAvailable()) {
      try {
        this.cachedSecretKey = await this.getSecretKeyFromKeychain();
        return this.cachedSecretKey;
      } catch (e) {
        debugLogger.warn(
          `Keychain access failed, falling back to file-based key: ${getErrorMessage(e)}`,
        );
      }
    }

    this.cachedSecretKey = await this.getSecretKeyFromFile();
    return this.cachedSecretKey;
  }

  private async getSecretKeyFromKeychain(): Promise<string> {
    let key = await this.keychainService.getPassword(SECRET_KEY_ACCOUNT);
    if (!key) {
      // Generate a fresh 256-bit key if none exists.
      key = randomBytes(32).toString('hex');
      await this.keychainService.setPassword(SECRET_KEY_ACCOUNT, key);
    }
    return key;
  }

  private async getSecretKeyFromFile(): Promise<string> {
    try {
      const key = await fs.promises.readFile(this.fallbackKeyPath, 'utf-8');
      return key.trim();
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        // Lazily create the config directory if it doesn't exist.
        const configDir = path.dirname(this.fallbackKeyPath);
        await fs.promises.mkdir(configDir, { recursive: true });

        // Generate a fresh 256-bit key for the local fallback.
        const key = randomBytes(32).toString('hex');

        // Store with restricted permissions (read/write for owner only).
        await fs.promises.writeFile(this.fallbackKeyPath, key, { mode: 0o600 });
        return key;
      }
      throw e;
    }
  }
}

/**
 * Handles the persistence and signature verification of the integrity store.
 * The entire store is signed to detect manual tampering of the JSON file.
 * @internal
 */
class ExtensionIntegrityStore {
  private readonly integrityStorePath: string;

  constructor(private readonly keyManager: IntegrityKeyManager) {
    const configDir = path.join(homedir(), GEMINI_DIR);
    this.integrityStorePath = path.join(configDir, INTEGRITY_FILENAME);
  }

  /**
   * Loads the integrity map from disk, verifying the store-wide signature.
   */
  async load(): Promise<ExtensionIntegrityMap> {
    let content: string;
    try {
      content = await fs.promises.readFile(this.integrityStorePath, 'utf-8');
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') {
        return {};
      }
      throw e;
    }

    const resetInstruction = `Please delete ${this.integrityStorePath} to reset it.`;

    // Parse and validate the store structure.
    let rawStore: IntegrityStore;
    try {
      rawStore = IntegrityStoreSchema.parse(JSON.parse(content));
    } catch (_) {
      throw new Error(
        `Failed to parse extension integrity store. ${resetInstruction}}`,
      );
    }

    const { store, signature: actualSignature } = rawStore;

    // Re-generate the expected signature for the store content.
    const storeContent = stableStringify(store) ?? '';
    const expectedSignature = await this.generateSignature(storeContent);

    // Verify the store hasn't been tampered with.
    if (!this.verifyConstantTime(actualSignature, expectedSignature)) {
      throw new Error(
        `Extension integrity store cannot be verified. ${resetInstruction}`,
      );
    }

    return store;
  }

  /**
   * Persists the integrity map to disk with a fresh store-wide signature.
   */
  async save(store: ExtensionIntegrityMap): Promise<void> {
    // Generate a signature for the entire map to prevent manual tampering.
    const storeContent = stableStringify(store) ?? '';
    const storeSignature = await this.generateSignature(storeContent);

    const finalData: IntegrityStore = {
      store,
      signature: storeSignature,
    };

    // Ensure parent directory exists before writing.
    const configDir = path.dirname(this.integrityStorePath);
    await fs.promises.mkdir(configDir, { recursive: true });

    // Use a 'write-then-rename' pattern for an atomic update.
    // Restrict file permissions to owner only (0o600).
    const tmpPath = `${this.integrityStorePath}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(finalData, null, 2), {
      mode: 0o600,
    });
    await fs.promises.rename(tmpPath, this.integrityStorePath);
  }

  /**
   * Generates a deterministic SHA-256 hash of the metadata.
   */
  generateHash(metadata: ExtensionInstallMetadata): string {
    const content = stableStringify(metadata) ?? '';
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generates an HMAC-SHA256 signature using the master secret key.
   */
  async generateSignature(data: string): Promise<string> {
    const secretKey = await this.keyManager.getSecretKey();
    return createHmac('sha256', secretKey).update(data).digest('hex');
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  verifyConstantTime(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    // timingSafeEqual requires buffers of the same length.
    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}

/**
 * Implementation of IExtensionIntegrity that persists data to disk.
 */
export class ExtensionIntegrityManager implements IExtensionIntegrity {
  private readonly keyManager: IntegrityKeyManager;
  private readonly integrityStore: ExtensionIntegrityStore;
  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    this.keyManager = new IntegrityKeyManager();
    this.integrityStore = new ExtensionIntegrityStore(this.keyManager);
  }

  /**
   * Verifies the provided metadata against the recorded integrity data.
   */
  async verify(
    extensionName: string,
    metadata: ExtensionInstallMetadata | undefined,
  ): Promise<IntegrityDataStatus> {
    if (!metadata) {
      return IntegrityDataStatus.MISSING;
    }

    try {
      const storeMap = await this.integrityStore.load();
      const extensionRecord = storeMap[extensionName];

      if (!extensionRecord) {
        return IntegrityDataStatus.MISSING;
      }

      // Verify the hash (metadata content) matches the recorded value.
      const actualHash = this.integrityStore.generateHash(metadata);
      const isHashValid = this.integrityStore.verifyConstantTime(
        actualHash,
        extensionRecord.hash,
      );

      if (!isHashValid) {
        debugLogger.warn(
          `Integrity mismatch for "${extensionName}": Hash mismatch.`,
        );
        return IntegrityDataStatus.INVALID;
      }

      // Verify the signature (authenticity) using the master secret key.
      const actualSignature =
        await this.integrityStore.generateSignature(actualHash);
      const isSignatureValid = this.integrityStore.verifyConstantTime(
        actualSignature,
        extensionRecord.signature,
      );

      if (!isSignatureValid) {
        debugLogger.warn(
          `Integrity mismatch for "${extensionName}": Signature mismatch.`,
        );
        return IntegrityDataStatus.INVALID;
      }

      return IntegrityDataStatus.VERIFIED;
    } catch (e) {
      debugLogger.warn(
        `Error verifying integrity for "${extensionName}": ${getErrorMessage(e)}`,
      );
      return IntegrityDataStatus.INVALID;
    }
  }

  /**
   * Records the integrity data for an extension.
   * Uses a promise chain to serialize concurrent store operations.
   */
  async store(
    extensionName: string,
    metadata: ExtensionInstallMetadata,
  ): Promise<void> {
    const operation = (async () => {
      await this.writeLock;

      // Generate integrity data for the new metadata.
      const hash = this.integrityStore.generateHash(metadata);
      const signature = await this.integrityStore.generateSignature(hash);

      // Update the store map and persist to disk.
      const storeMap = await this.integrityStore.load();
      storeMap[extensionName] = { hash, signature };
      await this.integrityStore.save(storeMap);
    })();

    // Update the lock to point to the latest operation, ensuring they are serialized.
    this.writeLock = operation.catch(() => {});
    return operation;
  }

  /**
   * Retrieves or generates the master secret key.
   * @internal visible for testing
   */
  async getSecretKey(): Promise<string> {
    return this.keyManager.getSecretKey();
  }
}
