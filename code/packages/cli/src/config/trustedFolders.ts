/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type HeadlessModeOptions,
  checkPathTrust,
  isHeadlessMode,
  loadTrustedFolders as loadCoreTrustedFolders,
  type LoadedTrustedFolders,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';

export {
  TrustLevel,
  isTrustLevel,
  resetTrustedFoldersForTesting,
  saveTrustedFolders,
} from '@google/gemini-cli-core';

export type {
  TrustRule,
  TrustedFoldersError,
  TrustedFoldersFile,
  TrustResult,
  LoadedTrustedFolders,
} from '@google/gemini-cli-core';

/** Is folder trust feature enabled per the current applied settings */
export function isFolderTrustEnabled(settings: Settings): boolean {
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? true;
  return folderTrustSetting;
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  return loadCoreTrustedFolders();
}

/**
 * Returns true or false if the workspace is considered "trusted".
 */
export function isWorkspaceTrusted(
  settings: Settings,
  workspaceDir: string = process.cwd(),
  headlessOptions?: HeadlessModeOptions,
): {
  isTrusted: boolean | undefined;
  source: 'ide' | 'file' | 'env' | undefined;
} {
  return checkPathTrust({
    path: workspaceDir,
    isFolderTrustEnabled: isFolderTrustEnabled(settings),
    isHeadless: isHeadlessMode(headlessOptions),
  });
}
