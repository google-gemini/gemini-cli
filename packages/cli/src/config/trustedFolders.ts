/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import {
  FatalConfigError,
  getErrorMessage,
  isWithinRoot,
  ideContextStore,
  GEMINI_DIR,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
import stripJsonComments from 'strip-json-comments';

export const TRUSTED_FOLDERS_FILENAME = 'trustedFolders.json';

export function getUserSettingsDir(): string {
  return path.join(homedir(), GEMINI_DIR);
}

export function getTrustedFoldersPath(): string {
  if (process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH']) {
    return process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'];
  }
  return path.join(getUserSettingsDir(), TRUSTED_FOLDERS_FILENAME);
}

export enum TrustLevel {
  TRUST_FOLDER = 'TRUST_FOLDER',
  TRUST_PARENT = 'TRUST_PARENT',
  DO_NOT_TRUST = 'DO_NOT_TRUST',
}

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

export class LoadedTrustedFolders {
  constructor(
    readonly user: TrustedFoldersFile,
    readonly errors: TrustedFoldersError[],
  ) {}

  get rules(): TrustRule[] {
    return Object.entries(this.user.config).map(([path, trustLevel]) => ({
      path,
      trustLevel,
    }));
  }

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
  ): boolean | undefined {
    const configToUse = config ?? this.user.config;
    const trustedPaths: string[] = [];
    const untrustedPaths: string[] = []; // 1. Segregate rules into trust and distrust lists for prioritized processing.

    for (const rule of Object.entries(configToUse).map(
      ([path, trustLevel]) => ({ path, trustLevel }),
    )) {
      switch (rule.trustLevel) {
        case TrustLevel.TRUST_FOLDER:
          trustedPaths.push(rule.path);
          break;
        case TrustLevel.TRUST_PARENT: // TRUST_PARENT applies trust to the parent of the configured path.
          trustedPaths.push(path.dirname(rule.path));
          break;
        case TrustLevel.DO_NOT_TRUST:
          untrustedPaths.push(rule.path);
          break;
        default: // Ignore unknown or invalid trust levels.
          break;
      }
    } // This ensures that a specific DO_NOT_TRUST rule always wins
    // against a more general TRUST_FOLDER rule from a parent.
    // 2. Check for explicit distrust rules first.
    for (const untrustedPath of untrustedPaths) {
      // Distrust is inherited by all children, so we check if the
      // location is *within* any untrusted path.
      if (isWithinRoot(location, untrustedPath)) {
        return false;
      }
    } // 3. If no distrust rules matched, check for trust rules.
    // Trust is applied recursively; if the location is *within* any
    // configured trusted path, it is considered trusted.

    for (const trustedPath of trustedPaths) {
      if (isWithinRoot(location, trustedPath)) {
        return true;
      }
    } // 4. If no rules matched, return undefined to indicate no opinion.

    return undefined;
  }
  setValue(path: string, trustLevel: TrustLevel): void {
    const originalTrustLevel = this.user.config[path];
    this.user.config[path] = trustLevel;
    try {
      saveTrustedFolders(this.user);
    } catch (e) {
      // Revert the in-memory change if the save failed.
      if (originalTrustLevel === undefined) {
        delete this.user.config[path];
      } else {
        this.user.config[path] = originalTrustLevel;
      }
      throw e;
    }
  }
}

let loadedTrustedFolders: LoadedTrustedFolders | undefined;

/**
 * FOR TESTING PURPOSES ONLY.
 * Resets the in-memory cache of the trusted folders configuration.
 */
export function resetTrustedFoldersForTesting(): void {
  loadedTrustedFolders = undefined;
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  if (loadedTrustedFolders) {
    return loadedTrustedFolders;
  }

  const errors: TrustedFoldersError[] = [];
  let userConfig: Record<string, TrustLevel> = {};

  const userPath = getTrustedFoldersPath();

  // Load user trusted folders
  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const parsed: unknown = JSON.parse(stripJsonComments(content));

      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        errors.push({
          message: 'Trusted folders file is not a valid JSON object.',
          path: userPath,
        });
      } else {
        userConfig = parsed as Record<string, TrustLevel>;
      }
    }
  } catch (error: unknown) {
    errors.push({
      message: getErrorMessage(error),
      path: userPath,
    });
  }

  loadedTrustedFolders = new LoadedTrustedFolders(
    { path: userPath, config: userConfig },
    errors,
  );
  return loadedTrustedFolders;
}

export function saveTrustedFolders(
  trustedFoldersFile: TrustedFoldersFile,
): void {
  // Ensure the directory exists
  const dirPath = path.dirname(trustedFoldersFile.path);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(
    trustedFoldersFile.path,
    JSON.stringify(trustedFoldersFile.config, null, 2),
    { encoding: 'utf-8', mode: 0o600 },
  );
}

/** Is folder trust feature enabled per the current applied settings */
export function isFolderTrustEnabled(settings: Settings): boolean {
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? false;
  return folderTrustSetting;
}

function getWorkspaceTrustFromLocalConfig(
  trustConfig?: Record<string, TrustLevel>,
): TrustResult {
  const folders = loadTrustedFolders();
  const configToUse = trustConfig ?? folders.user.config;

  if (folders.errors.length > 0) {
    const errorMessages = folders.errors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join('\n')}\nPlease fix the configuration file and try again.`,
    );
  }

  const isTrusted = folders.isPathTrusted(process.cwd(), configToUse);
  return {
    isTrusted,
    source: isTrusted !== undefined ? 'file' : undefined,
  };
}

export function isWorkspaceTrusted(
  settings: Settings,
  trustConfig?: Record<string, TrustLevel>,
): TrustResult {
  if (!isFolderTrustEnabled(settings)) {
    return { isTrusted: true, source: undefined };
  }

  const ideTrust = ideContextStore.get()?.workspaceState?.isTrusted;
  if (ideTrust !== undefined) {
    return { isTrusted: ideTrust, source: 'ide' };
  }

  // Fall back to the local user configuration
  return getWorkspaceTrustFromLocalConfig(trustConfig);
}
