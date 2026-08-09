/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Interface for OS-level secure storage operations.
 * Note: Method names must match the underlying library (e.g. @github/keytar)
 * to support correct dynamic loading and schema validation.
 */
export interface Keychain {
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
 * Zod schema to validate that a module satisfies the Keychain interface.
 */
export const KeychainSchema = z.object({
  getPassword: z.function(),
  setPassword: z.function(),
  deletePassword: z.function(),
  findCredentials: z.function(),
});

export const KEYCHAIN_TEST_PREFIX = '__keychain_test__';
export const SECRET_PREFIX = '__secret__';
