/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { lock } from 'proper-lockfile';
import {
  FatalConfigError,
  getErrorMessage,
  isWithinRoot,
  ideContextStore,
  GEMINI_DIR,
  homedir,
  isHeadlessMode,
  coreEvents,
  type HeadlessModeOptions,
} from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
import stripJsonComments from 'strip-json-comments';

const { promises: fsPromises } = fs;

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
 * Parses the trusted folders JSON content, stripping comments.
 */
function parseTrustedFoldersJson(content: string): unknown {
  return JSON.parse(stripJsonComments(content));
}

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
    headlessOptions?: HeadlessModeOptions,
  ): boolean | undefined {
    if (isHeadlessMode(headlessOptions)) {
      return true;
    }
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

  async setValue(folderPath: string, trustLevel: TrustLevel): Promise<void> {
    if (this.errors.length > 0) {
      const errorMessages = this.errors.map(
        (error) => `Error in ${error.path}: ${error.message}`,
      );
      throw new FatalConfigError(
        `Cannot update trusted folders because the configuration file is invalid:\n${errorMessages.join('\n')}\nPlease fix the file manually before trying to update it.`,
      );
    }

    const dirPath = path.dirname(this.user.path);
    if (!fs.existsSync(dirPath)) {
      await fsPromises.mkdir(dirPath, { recursive: true });
    }

    // lockfile requires the file to exist
    if (!fs.existsSync(this.user.path)) {
      await fsPromises.writeFile(this.user.path, JSON.stringify({}, null, 2), {
        mode: 0o600,
      });
    }

    const release = await lock(this.user.path, {
      retries: {
        retries: 10,
        minTimeout: 100,
      },
    });

    try {
      // Re-read the file to handle concurrent updates
      const content = await fsPromises.readFile(this.user.path, 'utf-8');
      let config: Record<string, TrustLevel>;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        config = parseTrustedFoldersJson(content) as Record<string, TrustLevel>;
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          `Failed to parse trusted folders file at ${this.user.path}. The file may be corrupted.`,
          error,
        );
        config = {};
      }

      const originalTrustLevel = config[folderPath];
      config[folderPath] = trustLevel;
      this.user.config[folderPath] = trustLevel;

      try {
        saveTrustedFolders({ ...this.user, config });
      } catch (e) {
        // Revert the in-memory change if the save failed.
        if (originalTrustLevel === undefined) {
          delete this.user.config[folderPath];
        } else {
          this.user.config[folderPath] = originalTrustLevel;
        }
        throw e;
      }
    } finally {
      await release();
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const parsed = parseTrustedFoldersJson(content) as Record<string, string>;

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

  const content = JSON.stringify(trustedFoldersFile.config, null, 2);
  const tempPath = `${trustedFoldersFile.path}.tmp.${crypto.randomUUID()}`;

  try {
    fs.writeFileSync(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
    });
    fs.renameSync(tempPath, trustedFoldersFile.path);
  } catch (error) {
    // Clean up temp file if it was created but rename failed
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/** Is folder trust feature enabled per the current applied settings */
export function isFolderTrustEnabled(settings: Settings): boolean {
  const folderTrustSetting = settings.security?.folderTrust?.enabled ?? true;
  return folderTrustSetting;
}

function getWorkspaceTrustFromLocalConfig(
  workspaceDir: string,
  trustConfig?: Record<string, TrustLevel>,
  headlessOptions?: HeadlessModeOptions,
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

  const isTrusted = folders.isPathTrusted(
    workspaceDir,
    configToUse,
    headlessOptions,
  );
  return {
    isTrusted,
    source: isTrusted !== undefined ? 'file' : undefined,
  };
}

export function isWorkspaceTrusted(
  settings: Settings,
  workspaceDir: string = process.cwd(),
  trustConfig?: Record<string, TrustLevel>,
  headlessOptions?: HeadlessModeOptions,
): TrustResult {
  if (isHeadlessMode(headlessOptions)) {
    return { isTrusted: true, source: undefined };
  }

  if (!isFolderTrustEnabled(settings)) {
    return { isTrusted: true, source: undefined };
  }

  const ideTrust = ideContextStore.get()?.workspaceState?.isTrusted;
  if (ideTrust !== undefined) {
    return { isTrusted: ideTrust, source: 'ide' };
  }

  // Fall back to the local user configuration
  return getWorkspaceTrustFromLocalConfig(
    workspaceDir,
    trustConfig,
    headlessOptions,
  );
}
