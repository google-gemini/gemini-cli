/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { lock } from 'proper-lockfile';
import stripJsonComments from 'strip-json-comments';
import { Storage } from '../config/storage.js';
import { normalizePath, isSubpath } from './paths.js';
import { FatalConfigError, getErrorMessage } from './errors.js';
import { coreEvents } from './events.js';
import { ideContextStore } from '../ide/ideContext.js';

export enum TrustLevel {
  TRUST_FOLDER = 'TRUST_FOLDER',
  TRUST_PARENT = 'TRUST_PARENT',
  DO_NOT_TRUST = 'DO_NOT_TRUST',
}

export interface TrustResult {
  isTrusted: boolean | undefined;
  source: 'ide' | 'file' | 'env' | undefined;
}

export interface TrustOptions {
  path: string;
  isFolderTrustEnabled: boolean;
  isHeadless?: boolean;
}

export function isTrustLevel(value: unknown): value is TrustLevel {
  return (
    typeof value === 'string' &&
    Object.values(TrustLevel).some((v) => v === value)
  );
}

/**
 * Checks if a path is trusted based on headless mode, folder trust settings,
 * IDE context, and local configuration file.
 */
export function checkPathTrust(options: TrustOptions): TrustResult {
  if (process.env['GEMINI_CLI_TRUST_WORKSPACE'] === 'true') {
    return { isTrusted: true, source: 'env' };
  }

  if (!options.isFolderTrustEnabled) {
    return { isTrusted: true, source: undefined };
  }

  const ideTrust = ideContextStore.get()?.workspaceState?.isTrusted;
  if (ideTrust !== undefined) {
    return { isTrusted: ideTrust, source: 'ide' };
  }

  const folders = loadTrustedFolders();

  if (folders.errors.length > 0) {
    const errorMessages = folders.errors.map(
      (error) => `Error in ${error.path}: ${error.message}`,
    );
    throw new FatalConfigError(
      `${errorMessages.join('\n')}\nPlease fix the configuration file and try again.`,
    );
  }

  const isTrusted = folders.isPathTrusted(options.path);
  return {
    isTrusted,
    source: isTrusted !== undefined ? 'file' : undefined,
  };
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

const realPathCache = new Map<string, string>();

/**
 * Parses the trusted folders JSON content, stripping comments.
 */
function parseTrustedFoldersJson(content: string): unknown {
  return JSON.parse(stripJsonComments(content));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
   * Returns true or false if the path should be "trusted" based on the configuration.
   *
   * @param location path
   * @param config optional config override
   * @returns boolean if trusted/distrusted, undefined if no rule matches
   */
  isPathTrusted(
    location: string,
    config?: Record<string, TrustLevel>,
  ): boolean | undefined {
    const configToUse = config ?? this.user.config;

    // Resolve location to its realpath for canonical comparison
    const realLocation = getRealPath(location);
    const normalizedLocation = normalizePath(realLocation);

    let longestMatchLen = -1;
    let longestMatchTrust: TrustLevel | undefined = undefined;

    for (const [rulePath, trustLevel] of Object.entries(configToUse)) {
      const effectivePath =
        trustLevel === TrustLevel.TRUST_PARENT
          ? path.dirname(rulePath)
          : rulePath;

      // Resolve effectivePath to its realpath for canonical comparison
      const realEffectivePath = getRealPath(effectivePath);
      const normalizedEffectivePath = normalizePath(realEffectivePath);

      if (isSubpath(normalizedEffectivePath, normalizedLocation)) {
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
    ) {
      return true;
    }

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
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    // lockfile requires the file to exist
    if (!fs.existsSync(this.user.path)) {
      await fs.promises.writeFile(this.user.path, JSON.stringify({}, null, 2), {
        // Restrict file access to read/write for the owner only
        mode: 0o600,
      });
    }

    const release = await lock(this.user.path, {
      retries: {
        retries: 10,
        minTimeout: 100,
      },
    });

    const normalizedPath = normalizePath(folderPath);
    const originalTrustLevel = this.user.config[normalizedPath];

    try {
      // Re-read the file to handle concurrent updates
      const content = await fs.promises.readFile(this.user.path, 'utf-8');
      const config: Record<string, TrustLevel> = {};
      try {
        const parsed = parseTrustedFoldersJson(content);
        if (isRecord(parsed)) {
          for (const [rawPath, value] of Object.entries(parsed)) {
            if (isTrustLevel(value)) {
              config[rawPath] = value;
            }
          }
        }
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          `Failed to parse trusted folders file at ${this.user.path}. The file may be corrupted.`,
          error,
        );
      }

      // Use normalized path as key
      config[normalizedPath] = trustLevel;
      this.user.config[normalizedPath] = trustLevel;

      try {
        saveTrustedFolders({ ...this.user, config });
      } catch (e) {
        // Revert the in-memory change if the save failed.
        if (originalTrustLevel === undefined) {
          delete this.user.config[normalizedPath];
        } else {
          this.user.config[normalizedPath] = originalTrustLevel;
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

  const userPath = Storage.getTrustedFoldersPath();
  try {
    if (fs.existsSync(userPath)) {
      const content = fs.readFileSync(userPath, 'utf-8');
      const parsed = parseTrustedFoldersJson(content);

      if (!isRecord(parsed)) {
        errors.push({
          message: 'Trusted folders file is not a valid JSON object.',
          path: userPath,
        });
      } else {
        for (const [rawPath, trustLevel] of Object.entries(parsed)) {
          const normalizedPath = normalizePath(rawPath);
          if (isTrustLevel(trustLevel)) {
            userConfig[normalizedPath] = trustLevel;
          } else {
            const possibleValues = Object.values(TrustLevel).join(', ');
            errors.push({
              message: `Invalid trust level "${trustLevel}" for path "${rawPath}". Possible values are: ${possibleValues}.`,
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
      // Restrict file access to read/write for the owner only
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
