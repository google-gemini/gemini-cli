/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as crypto from 'node:crypto';
import { z } from 'zod';
import { coreEvents } from '../utils/events.js';
import { KeychainAvailabilityEvent } from '../telemetry/types.js';

/**
 * Interface describing the contract for OS-level secure storage operations.
 */
export interface Keystore {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(
    service: string,
    account: string,
    password: string,
  ): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(
    service: string,
  ): Promise<Array<{ account: string; password: string }>>;
}

/**
 * Zod schema to safely validate that a dynamically imported module
 * satisfies the Keystore interface.
 */
const KeystoreSchema = z.object({
  getPassword: z.function(),
  setPassword: z.function(),
  deletePassword: z.function(),
  findCredentials: z.function(),
});

export const KEYCHAIN_TEST_PREFIX = '__keychain_test__';

/**
 * Generic service for interacting with the OS-level keystore (e.g., via keytar).
 * Provides a unified API for secret management with automatic availability
 * checking and telemetry.
 */
export class KeystoreService {
  private keystoreModule: Keystore | null = null;
  private loadAttempted = false;
  private availability: boolean | null = null;

  /**
   * @param serviceName The unique identifier for the application in the OS keystore.
   */
  constructor(private readonly serviceName: string) {}

  /**
   * Dynamically imports the underlying keystore implementation (keytar)
   * and validates its structure.
   */
  private async getKeystore(): Promise<Keystore | null> {
    if (this.loadAttempted) {
      return this.keystoreModule;
    }

    this.loadAttempted = true;

    try {
      const moduleName = 'keytar';
      const module: unknown = await import(moduleName);
      let potentialKeystore: unknown;
      if (this.isRecord(module)) {
        potentialKeystore = module['default'] || module;
      } else {
        potentialKeystore = module;
      }

      const result = KeystoreSchema.safeParse(potentialKeystore);
      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        this.keystoreModule = potentialKeystore as Keystore;
      }
    } catch (_) {
      // underlying keystore library is optional/missing
    }
    return this.keystoreModule;
  }

  private isRecord(obj: unknown): obj is Record<string, unknown> {
    return typeof obj === 'object' && obj !== null;
  }

  /**
   * Verifies if the OS-level keystore is accessible and functional by
   * performing a set-get-delete test cycle.
   */
  async isAvailable(): Promise<boolean> {
    if (this.availability !== null) {
      return this.availability;
    }

    try {
      const keystore = await this.getKeystore();
      if (!keystore) {
        this.availability = false;
        return false;
      }

      const testAccount = `${KEYCHAIN_TEST_PREFIX}${crypto.randomBytes(8).toString('hex')}`;
      const testPassword = 'test';

      await keystore.setPassword(this.serviceName, testAccount, testPassword);
      const retrieved = await keystore.getPassword(
        this.serviceName,
        testAccount,
      );
      const deleted = await keystore.deletePassword(
        this.serviceName,
        testAccount,
      );

      const success = deleted && retrieved === testPassword;
      this.availability = success;

      coreEvents.emitTelemetryKeychainAvailability(
        new KeychainAvailabilityEvent(success),
      );

      return success;
    } catch (_error) {
      this.availability = false;
      coreEvents.emitTelemetryKeychainAvailability(
        new KeychainAvailabilityEvent(false),
      );
      return false;
    }
  }

  /**
   * Retrieves a secret from the keystore for the given account.
   */
  async getPassword(account: string): Promise<string | null> {
    if (!(await this.isAvailable())) return null;
    const keystore = await this.getKeystore();
    return keystore?.getPassword(this.serviceName, account) ?? null;
  }

  /**
   * Securely stores a secret in the keystore.
   * @throws Error if the keystore is unavailable.
   */
  async setPassword(account: string, value: string): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error('Keystore is not available');
    }
    const keystore = await this.getKeystore();
    if (!keystore) {
      throw new Error('Keystore module not found');
    }
    await keystore.setPassword(this.serviceName, account, value);
  }

  /**
   * Removes a secret from the keystore.
   * @returns true if the secret was deleted, false otherwise.
   */
  async deletePassword(account: string): Promise<boolean> {
    if (!(await this.isAvailable())) return false;
    const keystore = await this.getKeystore();
    return keystore?.deletePassword(this.serviceName, account) ?? false;
  }

  /**
   * Lists all account/secret pairs stored under this service.
   */
  async listCredentials(): Promise<
    Array<{ account: string; password: string }>
  > {
    if (!(await this.isAvailable())) return [];
    const keystore = await this.getKeystore();
    return keystore?.findCredentials(this.serviceName) ?? [];
  }
}
