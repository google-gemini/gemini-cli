/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type HeadlessModeOptions } from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
export declare const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';
export declare function getUserSettingsDir(): string;
export declare function getTrustedFoldersPath(): string;
export declare enum TrustLevel {
  TRUST_FOLDER = 'TRUST_FOLDER',
  TRUST_PARENT = 'TRUST_PARENT',
  DO_NOT_TRUST = 'DO_NOT_TRUST',
}
export declare function isTrustLevel(
  value: string | number | boolean | object | null | undefined,
): value is TrustLevel;
export interface TrustRule {
  path: string;
  trustLevel: TrustLevel;
}
export interface TrustedFoldersError {
  message: string;
  path: string;
}
export interface TrustedFoldersFile {
  config: Record<string, TrustLevel>;
  path: string;
}
export interface TrustResult {
  isTrusted: boolean | undefined;
  source: 'ide' | 'file' | undefined;
}
/**
 * FOR TESTING PURPOSES ONLY.
 * Clears the real path cache.
 */
export declare function clearRealPathCacheForTesting(): void;
export declare class LoadedTrustedFolders {
  readonly user: TrustedFoldersFile;
  readonly errors: TrustedFoldersError[];
  constructor(user: TrustedFoldersFile, errors: TrustedFoldersError[]);
  get rules(): TrustRule[];
  /**
   * Returns true or false if the path should be "trusted". This function
   * should only be invoked when the folder trust setting is active.
   *
   * @param location path
   * @returns
   */
  isPathTrusted(
    location: string,
    config?: Record<string, TrustLevel>,
    headlessOptions?: HeadlessModeOptions,
  ): boolean | undefined;
  setValue(folderPath: string, trustLevel: TrustLevel): Promise<void>;
}
/**
 * FOR TESTING PURPOSES ONLY.
 * Resets the in-memory cache of the trusted folders configuration.
 */
export declare function resetTrustedFoldersForTesting(): void;
export declare function loadTrustedFolders(): LoadedTrustedFolders;
export declare function saveTrustedFolders(
  trustedFoldersFile: TrustedFoldersFile,
): void;
/** Is folder trust feature enabled per the current applied settings */
export declare function isFolderTrustEnabled(settings: Settings): boolean;
export declare function isWorkspaceTrusted(
  settings: Settings,
  workspaceDir?: string,
  trustConfig?: Record<string, TrustLevel>,
  headlessOptions?: HeadlessModeOptions,
): TrustResult;
