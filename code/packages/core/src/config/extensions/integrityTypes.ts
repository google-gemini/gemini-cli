/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { type ExtensionInstallMetadata } from '../config.js';

/**
 * Zod schema for a single extension's integrity data.
 */
export const ExtensionIntegrityDataSchema = z.object({
  hash: z.string(),
  signature: z.string(),
});

/**
 * Zod schema for the map of extension names to integrity data.
 */
export const ExtensionIntegrityMapSchema = z.record(
  z.string(),
  ExtensionIntegrityDataSchema,
);

/**
 * Zod schema for the full integrity store file structure.
 */
export const IntegrityStoreSchema = z.object({
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
 * The full structure of the integrity store as persisted on disk.
 */
export type IntegrityStore = z.infer<typeof IntegrityStoreSchema>;

/**
 * Result status of an extension integrity verification.
 */
export enum IntegrityDataStatus {
  VERIFIED = 'verified',
  MISSING = 'missing',
  INVALID = 'invalid',
}

/**
 * Interface for managing extension integrity.
 */
export interface IExtensionIntegrity {
  /**
   * Verifies the integrity of an extension's installation metadata.
   */
  verify(
    extensionName: string,
    metadata: ExtensionInstallMetadata | undefined,
  ): Promise<IntegrityDataStatus>;

  /**
   * Signs and stores the extension's installation metadata.
   */
  store(
    extensionName: string,
    metadata: ExtensionInstallMetadata,
  ): Promise<void>;
}
