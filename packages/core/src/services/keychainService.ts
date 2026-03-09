/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { coreEvents } from '../utils/events.js';
import { KeychainAvailabilityEvent } from '../telemetry/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  type Keychain,
  KeychainSchema,
  KEYCHAIN_TEST_PREFIX,
} from './keychainTypes.js';
import { isRecord } from '../utils/markdownUtils.js';

/**
 * Service for interacting with OS-level secure storage (e.g. keytar).
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
    let resultKeychain: Keychain | null = null;

    try {
      const keychainModule = await this.loadKeychainModule();
      if (keychainModule) {
        if (await this.isKeychainFunctional(keychainModule)) {
          resultKeychain = keychainModule;
        } else {
          debugLogger.log('Keychain functional verification failed');
        }
      }
    } catch (error) {
      // Avoid logging full error objects to prevent PII exposure.
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.log('Keychain initialization encountered an error:', message);
    }

    coreEvents.emitTelemetryKeychainAvailability(
      new KeychainAvailabilityEvent(resultKeychain !== null),
    );

    return resultKeychain;
  }

  // Low-level dynamic loading and structural validation.
  private async loadKeychainModule(): Promise<Keychain | null> {
    const moduleName = 'keytar';
    const module: unknown = await import(moduleName);
    const potential = (isRecord(module) && module['default']) || module;

    const result = KeychainSchema.safeParse(potential);
    if (result.success) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return potential as Keychain;
    }

    debugLogger.log(
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
}
