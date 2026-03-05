/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { coreEvents } from '../utils/events.js';
import { KeychainAvailabilityEvent } from '../telemetry/types.js';
import {
  type Keystore,
  KeystoreSchema,
  InitializationState,
  KEYCHAIN_TEST_PREFIX,
} from './keystoreTypes.js';

/**
 * Service for interacting with OS-level secure storage (e.g. keytar).
 */
export class KeystoreService {
  private initializationState: InitializationState =
    InitializationState.UNKNOWN;

  // The functional keystore module if initialization succeeded, null otherwise.
  private initializedModule: Keystore | null = null;

  /**
   * @param serviceName Unique identifier for the app in the OS keystore.
   */
  constructor(private readonly serviceName: string) {}

  async isAvailable(): Promise<boolean> {
    return (await this.getKeystore()) !== null;
  }

  // Returns the secret string, or null if not found.
  async getPassword(account: string): Promise<string | null> {
    const keystore = await this.getKeystoreOrThrow();
    return keystore.getPassword(this.serviceName, account);
  }

  async setPassword(account: string, value: string): Promise<void> {
    const keystore = await this.getKeystoreOrThrow();
    await keystore.setPassword(this.serviceName, account, value);
  }

  // Returns true if the secret was deleted, false otherwise.
  async deletePassword(account: string): Promise<boolean> {
    const keystore = await this.getKeystoreOrThrow();
    return keystore.deletePassword(this.serviceName, account);
  }

  async listCredentials(): Promise<
    Array<{ account: string; password: string }>
  > {
    const keystore = await this.getKeystoreOrThrow();
    return keystore.listCredentials(this.serviceName);
  }

  private async getKeystoreOrThrow(): Promise<Keystore> {
    const keystore = await this.getKeystore();
    if (!keystore) {
      throw new Error('Keystore is not available');
    }
    return keystore;
  }

  private async getKeystore(): Promise<Keystore | null> {
    if (this.initializationState === InitializationState.UNKNOWN) {
      await this.initializeKeystore();
    }

    return this.initializedModule;
  }

  private async initializeKeystore(): Promise<void> {
    try {
      // Dynamically load the keystore module.
      const moduleName = 'keytar';
      const module: unknown = await import(moduleName);
      let potentialKeystore = module;
      if (this.isRecord(module) && module['default']) {
        potentialKeystore = module['default'];
      }

      // Validate module structure and perform functional test.
      const result = KeystoreSchema.safeParse(potentialKeystore);
      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const keystore = potentialKeystore as Keystore;
        if (await this.isKeystoreFunctional(keystore)) {
          this.initializedModule = keystore;
          this.initializationState = InitializationState.SUCCESS;
        }
      }
    } catch (_) {
      // Module load or functional test error.
    }

    // If not successful, mark as failed.
    if (this.initializationState === InitializationState.UNKNOWN) {
      this.initializationState = InitializationState.FAILURE;
    }

    coreEvents.emitTelemetryKeychainAvailability(
      new KeychainAvailabilityEvent(
        this.initializationState === InitializationState.SUCCESS,
      ),
    );
  }

  private isRecord(obj: unknown): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null;
  }

  // Performs a set-get-delete cycle to verify keystore functionality.
  private async isKeystoreFunctional(keystore: Keystore): Promise<boolean> {
    const testAccount = `${KEYCHAIN_TEST_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
    const testPassword = 'test';

    let success = false;
    try {
      await keystore.setPassword(this.serviceName, testAccount, testPassword);
      const retrieved = await keystore.getPassword(
        this.serviceName,
        testAccount,
      );
      const deleted = await keystore.deletePassword(
        this.serviceName,
        testAccount,
      );

      success = deleted && retrieved === testPassword;
    } catch (_) {
      success = false;
    }

    return success;
  }
}
