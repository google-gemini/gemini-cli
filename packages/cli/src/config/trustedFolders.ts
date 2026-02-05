/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FatalConfigError,
  getErrorMessage,
  isWithinRoot,
  ideContextStore,
  GEMINI_DIR,
  homedir,
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

export function isTrustLevel(
  value: string | number | boolean | object | null | undefined,
): value is TrustLevel {
  return (
    typeof value === 'string' &&
    Object.values(TrustLevel).includes(value as TrustLevel)
  );
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

const realPathCache = new Map<string, string>();

/**
 * FOR TESTING PURPOSES ONLY.
 * Clears the real path cache.
 */
export function clearRealPathCacheForTesting(): void {
  realPathCache.clear();
}

function getRealPath(location: string): string {
  let realPath = realPathCache.get(location);
  if (realPath !== undefined) {
    return realPath;
  }

  try {
    realPath = fs.existsSync(location) ? fs.realpathSync(location) : location;
  } catch {
    realPath = location;
  }

  realPathCache.set(location, realPath);
  return realPath;
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

    // Resolve location to its realpath for canonical comparison
    const realLocation = getRealPath(location);

    let longestMatchLen = -1;
    let longestMatchTrust: TrustLevel | undefined = undefined;

    for (const [rulePath, trustLevel] of Object.entries(configToUse)) {
      const effectivePath =
        trustLevel === TrustLevel.TRUST_PARENT
          ? path.dirname(rulePath)
          : rulePath;

      // Resolve effectivePath to its realpath for canonical comparison
      const realEffectivePath = getRealPath(effectivePath);

      if (isWithinRoot(realLocation, realEffectivePath)) {
        if (rulePath.length > longestMatchLen) {
          longestMatchLen = rulePath.length;
          longestMatchTrust = trustLevel;
        }
      }
    }

    if (longestMatchTrust === TrustLevel.DO_NOT_TRUST) return false;
    if (
      longestMatchTrust === TrustLevel.TRUST_FOLDER ||
      longestMatchTrust === TrustLevel.TRUST_PARENT
    )
      return true;

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
  clearRealPathCacheForTesting();
}

export function loadTrustedFolders(): LoadedTrustedFolders {
  if (loadedTrustedFolders) {
    return loadedTrustedFolders;
  }

  const errors: TrustedFoldersError[] = [];
  const userConfig: Record<string, TrustLevel> = {};

  const userPath = getTrustedFoldersPath();
  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const parsed = JSON.parse(stripJsonComments(content)) as Record<
        string,
        string
      >;

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
        for (const [path, trustLevel] of Object.entries(parsed)) {
          if (isTrustLevel(trustLevel)) {
            userConfig[path] = trustLevel;
          } else {
            const possibleValues = Object.values(TrustLevel).join(', ');
            errors.push({
              message: `Invalid trust level "${trustLevel}" for path "${path}". Possible values are: ${possibleValues}.`,
              path: userPath,
            });
          }
        }
      }
    }
  } catch (error) {
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
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? true;
  return folderTrustSetting;
}

function getWorkspaceTrustFromLocalConfig(
  workspaceDir: string,
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

  const isTrusted = folders.isPathTrusted(workspaceDir, configToUse);
  return {
    isTrusted,
    source: isTrusted !== undefined ? 'file' : undefined,
  };
}

export function isWorkspaceTrusted(
  settings: Settings,
  workspaceDir: string = process.cwd(),
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
  return getWorkspaceTrustFromLocalConfig(workspaceDir, trustConfig);
}
