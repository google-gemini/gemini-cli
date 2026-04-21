/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { coreEvents } from '../utils/events.js';
import { KeychainAvailabilityEvent } from '../telemetry/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  type Keychain,
  KeychainSchema,
  KEYCHAIN_TEST_PREFIX,
} from './keychainTypes.js';
import { isRecord } from '../utils/markdownUtils.js';
import { FileKeychain } from './fileKeychain.js';

export const FORCE_FILE_STORAGE_ENV_VAR = 'GEMINI_FORCE_FILE_STORAGE';

/**
 * Service for interacting with OS-level secure storage (e.g. @github/keytar).
 */
export class KeychainService {
  // Track an ongoing initialization attempt to avoid race conditions.
  private initializationPromise?: Promise<Keychain | null>;

  /**
   * @param serviceName Unique identifier for the app in the OS keychain.
   */
  constructor(private readonly serviceName: string) {}

  async isAvailable(): Promise<boolean> {
    return (await this.getKeychain()) !== null;
  }

  /**
   * Returns true if the service is using the encrypted file fallback backend.
   */
  async isUsingFileFallback(): Promise<boolean> {
    const keychain = await this.getKeychain();
    return keychain instanceof FileKeychain;
  }

  /**
   * Retrieves a secret for the given account.
   * @throws Error if the keychain is unavailable.
   */
  async getPassword(account: string): Promise<string | null> {
    const keychain = await this.getKeychainOrThrow();
    return keychain.getPassword(this.serviceName, account);
  }

  /**
   * Securely stores a secret.
   * @throws Error if the keychain is unavailable.
   */
  async setPassword(account: string, value: string): Promise<void> {
    const keychain = await this.getKeychainOrThrow();
    await keychain.setPassword(this.serviceName, account, value);
  }

  /**
   * Removes a secret from the keychain.
   * @returns true if the secret was deleted, false otherwise.
   * @throws Error if the keychain is unavailable.
   */
  async deletePassword(account: string): Promise<boolean> {
    const keychain = await this.getKeychainOrThrow();
    return keychain.deletePassword(this.serviceName, account);
  }

  /**
   * Lists all account/secret pairs stored under this service.
   * @throws Error if the keychain is unavailable.
   */
  async findCredentials(): Promise<
    Array<{ account: string; password: string }>
  > {
    const keychain = await this.getKeychainOrThrow();
    return keychain.findCredentials(this.serviceName);
  }

  private async getKeychainOrThrow(): Promise<Keychain> {
    const keychain = await this.getKeychain();
    if (!keychain) {
      throw new Error('Keychain is not available');
    }
    return keychain;
  }

  private getKeychain(): Promise<Keychain | null> {
    return (this.initializationPromise ??= this.initializeKeychain());
  }

  // High-level orchestration of the loading and testing cycle.
  private async initializeKeychain(): Promise<Keychain | null> {
    const forceFileStorage = process.env[FORCE_FILE_STORAGE_ENV_VAR] === 'true';

    // Try to get the native OS keychain unless file storage is requested.
    const nativeKeychain = forceFileStorage
      ? null
      : await this.getNativeKeychain();

    coreEvents.emitTelemetryKeychainAvailability(
      new KeychainAvailabilityEvent(nativeKeychain !== null),
    );

    if (nativeKeychain) {
      return nativeKeychain;
    }

    // If native failed or was skipped, return the secure file fallback.
    debugLogger.debug('Using FileKeychain fallback for secure storage.');
    return new FileKeychain();
  }

  /**
   * Attempts to load and verify the native keychain module (@github/keytar).
   */
  private async getNativeKeychain(): Promise<Keychain | null> {
    try {
      const keychainModule = await this.loadKeychainModule();
      if (!keychainModule) {
        return null;
      }

      // Probing macOS prevents process-blocking popups when no keychain exists.
      if (os.platform() === 'darwin' && !this.isMacOSKeychainAvailable()) {
        debugLogger.debug(
          'MacOS default keychain not found; skipping functional verification.',
        );
        return null;
      }

      if (await this.isKeychainFunctional(keychainModule)) {
        return keychainModule;
      }

      debugLogger.debug('Keychain functional verification failed');
      return null;
    } catch (error) {
      // Avoid logging full error objects to prevent PII exposure.
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.debug(
        'Keychain initialization encountered an error:',
        message,
      );
      return null;
    }
  }

  // Low-level dynamic loading and structural validation.
  private async loadKeychainModule(): Promise<Keychain | null> {
    const moduleName = '@github/keytar';
    const module: unknown = await import(moduleName);
    const potential = (isRecord(module) && module['default']) || module;

    const result = KeychainSchema.safeParse(potential);
    if (result.success) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return potential as Keychain;
    }

    debugLogger.debug(
      'Keychain module failed structural validation:',
      result.error.flatten().fieldErrors,
    );
    return null;
  }

  // Performs a set-get-delete cycle to verify keychain functionality.
  private async isKeychainFunctional(keychain: Keychain): Promise<boolean> {
    const testAccount = `${KEYCHAIN_TEST_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
    const testPassword = 'test';

    await keychain.setPassword(this.serviceName, testAccount, testPassword);
    const retrieved = await keychain.getPassword(this.serviceName, testAccount);
    const deleted = await keychain.deletePassword(
      this.serviceName,
      testAccount,
    );

    return deleted && retrieved === testPassword;
  }

  /**
   * MacOS-specific check to detect if a default keychain is available.
   */
  private isMacOSKeychainAvailable(): boolean {
    // Probing via the `security` CLI avoids a blocking OS-level popup that
    // occurs when calling @github/keytar without a configured keychain.
    const result = spawnSync('security', ['default-keychain'], {
      encoding: 'utf8',
      // We pipe stdout to read the path, but ignore stderr to suppress
      // "keychain not found" errors from polluting the terminal.
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // If the command fails or lacks output, no default keychain is configured.
    if (result.error || result.status !== 0 || !result.stdout) {
      return false;
    }

    // Validate that the returned path string is not empty.
    const trimmed = result.stdout.trim();
    if (!trimmed) {
      return false;
    }

    // The output usually contains the path wrapped in double quotes.
    const match = trimmed.match(/"(.*)"/);
    const keychainPath = match ? match[1] : trimmed;

    // Finally, verify the path exists on disk to ensure it's not a stale reference.
    return !!keychainPath && fs.existsSync(keychainPath);
  }
}
