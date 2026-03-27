/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { coreEvents } from './events.js';

export const GEMINI_DIR = '.gemini';
export const USER_CONFIG_DIR_NAME = 'gemini-cli';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
export const GEMINI_CONFIG_DIR_ENV = 'GEMINI_CONFIG_DIR';
export const GEMINI_CACHE_DIR_ENV = 'GEMINI_CACHE_DIR';
export const GEMINI_TMP_DIR_ENV = 'GEMINI_TMP_DIR';
export const GEMINI_CLI_HOME_ENV = 'GEMINI_CLI_HOME';

let warnedAboutDualUserConfigDirs = false;

export function resetUserConfigDirWarningForTesting(): void {
  warnedAboutDualUserConfigDirs = false;
}

/**
 * Returns the home directory.
 * If the deprecated GEMINI_CLI_HOME environment variable is set, it returns its value.
 * Otherwise, it returns the user's home directory.
 */
export function homedir(): string {
  const envHome = process.env[GEMINI_CLI_HOME_ENV];
  if (envHome) {
    return envHome;
  }
  return os.homedir();
}

function getAbsoluteEnvPath(envVar: string): string | undefined {
  const value = process.env[envVar];
  if (!value || !path.isAbsolute(value)) {
    return undefined;
  }
  return value;
}

function ensureDirectoryExists(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function validateUserDirectoryEnvironment(): void {
  const exactDirOverrides = [
    GEMINI_CONFIG_DIR_ENV,
    GEMINI_CACHE_DIR_ENV,
    GEMINI_TMP_DIR_ENV,
  ].filter((envVar) => process.env[envVar]);

  if (process.env[GEMINI_CLI_HOME_ENV] && exactDirOverrides.length > 0) {
    throw new Error(
      `${exactDirOverrides.map((envVar) => `$${envVar}`).join(', ')} and deprecated $${GEMINI_CLI_HOME_ENV} cannot both be set. Unset $${GEMINI_CLI_HOME_ENV} and keep the exact $*_DIR overrides you want to use.`,
    );
  }
}

/**
 * Returns the user-level Gemini config directory.
 * Preference order:
 * 1. GEMINI_CONFIG_DIR exact override
 * 2. Deprecated GEMINI_CLI_HOME root override
 * 3. XDG config dir at $XDG_CONFIG_HOME/gemini-cli
 * 4. Legacy user config dir if it already exists
 * 5. Create and use the XDG config dir
 */
export function getUserConfigDir(): string {
  const explicitConfigDir = process.env[GEMINI_CONFIG_DIR_ENV];
  if (explicitConfigDir) {
    return ensureDirectoryExists(explicitConfigDir);
  }

  const envHome = process.env[GEMINI_CLI_HOME_ENV];
  if (envHome) {
    return path.join(envHome, GEMINI_DIR);
  }

  const homeDir = os.homedir();
  if (!homeDir) {
    return path.join(os.tmpdir(), GEMINI_DIR);
  }

  const legacyDir = path.join(homeDir, GEMINI_DIR);
  const xdgConfigHome =
    getAbsoluteEnvPath('XDG_CONFIG_HOME') ?? path.join(homeDir, '.config');
  const xdgGeminiDir = path.join(xdgConfigHome, USER_CONFIG_DIR_NAME);

  const xdgExists = fs.existsSync(xdgGeminiDir);
  const legacyExists = fs.existsSync(legacyDir);

  if (xdgExists && legacyExists) {
    const resolveRealPath = (dir: string): string => {
      try {
        return fs.realpathSync(dir);
      } catch {
        return dir;
      }
    };
    const xdgRealPath = resolveRealPath(xdgGeminiDir);
    const legacyRealPath = resolveRealPath(legacyDir);

    if (xdgRealPath !== legacyRealPath && !warnedAboutDualUserConfigDirs) {
      warnedAboutDualUserConfigDirs = true;
      coreEvents.emitFeedback(
        'warning',
        [
          `Both user config directories exist: ${xdgGeminiDir} and ${legacyDir}.`,
          `Gemini CLI will use ${xdgGeminiDir}.`,
          'Options:',
          `1) Merge all config into ${xdgGeminiDir} (suggested)`,
          `2) Merge all config into ${legacyDir} (deprecated, legacy directory)`,
          `3) Do nothing, continue receiving this warning (before using ${xdgGeminiDir})`,
          `Or set $${GEMINI_CONFIG_DIR_ENV} to choose an exact user config directory explicitly.`,
        ].join(' '),
      );
    }
  }

  if (xdgExists) {
    return xdgGeminiDir;
  }

  if (legacyExists) {
    return legacyDir;
  }

  fs.mkdirSync(xdgGeminiDir, { recursive: true });
  return xdgGeminiDir;
}

export function getUserCacheDir(): string {
  const explicitCacheDir = process.env[GEMINI_CACHE_DIR_ENV];
  if (explicitCacheDir) {
    return explicitCacheDir;
  }

  const homeDir = os.homedir();
  if (!homeDir) {
    return path.join(os.tmpdir(), USER_CONFIG_DIR_NAME);
  }

  const xdgCacheHome =
    getAbsoluteEnvPath('XDG_CACHE_HOME') ?? path.join(homeDir, '.cache');
  return path.join(xdgCacheHome, USER_CONFIG_DIR_NAME);
}

export function getUserTmpDir(): string {
  const explicitTmpDir = process.env[GEMINI_TMP_DIR_ENV];
  if (explicitTmpDir) {
    return explicitTmpDir;
  }

  return path.join(getUserCacheDir(), 'tmp');
}

/**
 * Returns the operating system's default directory for temporary files.
 */
export function tmpdir(): string {
  return os.tmpdir();
}

/**
 * Replaces the home directory with a tilde.
 * @param path - The path to tildeify.
 * @returns The tildeified path.
 */
export function tildeifyPath(path: string): string {
  const homeDir = homedir();
  if (path.startsWith(homeDir)) {
    return path.replace(homeDir, '~');
  }
  return path;
}

/**
 * Shortens a path string if it exceeds maxLen, prioritizing the start and end segments.
 * Example: /path/to/a/very/long/file.txt -> /path/.../long/file.txt
 */
export function shortenPath(filePath: string, maxLen: number = 35): string {
  if (filePath.length <= maxLen) {
    return filePath;
  }

  const simpleTruncate = () => {
    const keepLen = Math.floor((maxLen - 3) / 2);
    if (keepLen <= 0) {
      return filePath.substring(0, maxLen - 3) + '...';
    }
    const start = filePath.substring(0, keepLen);
    const end = filePath.substring(filePath.length - keepLen);
    return `${start}...${end}`;
  };

  type TruncateMode = 'start' | 'end' | 'center';

  const truncateComponent = (
    component: string,
    targetLength: number,
    mode: TruncateMode,
  ): string => {
    if (component.length <= targetLength) {
      return component;
    }

    if (targetLength <= 0) {
      return '';
    }

    if (targetLength <= 3) {
      if (mode === 'end') {
        return component.slice(-targetLength);
      }
      return component.slice(0, targetLength);
    }

    if (mode === 'start') {
      return `${component.slice(0, targetLength - 3)}...`;
    }

    if (mode === 'end') {
      return `...${component.slice(component.length - (targetLength - 3))}`;
    }

    const front = Math.ceil((targetLength - 3) / 2);
    const back = targetLength - 3 - front;
    return `${component.slice(0, front)}...${component.slice(
      component.length - back,
    )}`;
  };

  const parsedPath = path.parse(filePath);
  const root = parsedPath.root;
  const separator = path.sep;

  // Get segments of the path *after* the root
  const relativePath = filePath.substring(root.length);
  const segments = relativePath.split(separator).filter((s) => s !== ''); // Filter out empty segments

  // Handle cases with no segments after root (e.g., "/", "C:\") or only one segment
  if (segments.length <= 1) {
    // Fall back to simple start/end truncation for very short paths or single segments
    return simpleTruncate();
  }

  const firstDir = segments[0];
  const lastSegment = segments[segments.length - 1];
  const startComponent = root + firstDir;

  const endPartSegments = [lastSegment];
  let endPartLength = lastSegment.length;

  // Iterate backwards through the middle segments
  for (let i = segments.length - 2; i > 0; i--) {
    const segment = segments[i];
    const newLength =
      startComponent.length +
      separator.length +
      3 + // for "..."
      separator.length +
      endPartLength +
      separator.length +
      segment.length;

    if (newLength <= maxLen) {
      endPartSegments.unshift(segment);
      endPartLength += separator.length + segment.length;
    } else {
      break;
    }
  }

  const components = [firstDir, ...endPartSegments];
  const componentModes: TruncateMode[] = components.map((_, index) => {
    if (index === 0) {
      return 'start';
    }
    if (index === components.length - 1) {
      return 'end';
    }
    return 'center';
  });

  const separatorsCount = endPartSegments.length + 1;
  const fixedLen = root.length + separatorsCount * separator.length + 3; // ellipsis length
  const availableForComponents = maxLen - fixedLen;

  const trailingFallback = () => {
    const ellipsisTail = `...${separator}${lastSegment}`;
    if (ellipsisTail.length <= maxLen) {
      return ellipsisTail;
    }

    if (root) {
      const rootEllipsisTail = `${root}...${separator}${lastSegment}`;
      if (rootEllipsisTail.length <= maxLen) {
        return rootEllipsisTail;
      }
    }

    if (root && `${root}${lastSegment}`.length <= maxLen) {
      return `${root}${lastSegment}`;
    }

    if (lastSegment.length <= maxLen) {
      return lastSegment;
    }

    // As a final resort (e.g., last segment itself exceeds maxLen), fall back to simple truncation.
    return simpleTruncate();
  };

  if (availableForComponents <= 0) {
    return trailingFallback();
  }

  const minLengths = components.map((component, index) => {
    if (index === 0) {
      return Math.min(component.length, 1);
    }
    if (index === components.length - 1) {
      return component.length; // Never truncate the last segment when possible.
    }
    return Math.min(component.length, 1);
  });

  const minTotal = minLengths.reduce((sum, len) => sum + len, 0);
  if (availableForComponents < minTotal) {
    return trailingFallback();
  }

  const budgets = components.map((component) => component.length);
  let currentTotal = budgets.reduce((sum, len) => sum + len, 0);

  const pickIndexToReduce = () => {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < budgets.length; i++) {
      if (budgets[i] <= minLengths[i]) {
        continue;
      }
      const isLast = i === budgets.length - 1;
      const score = (isLast ? 0 : 1_000_000) + budgets[i];
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  while (currentTotal > availableForComponents) {
    const index = pickIndexToReduce();
    if (index === -1) {
      return trailingFallback();
    }
    budgets[index]--;
    currentTotal--;
  }

  const truncatedComponents = components.map((component, index) =>
    truncateComponent(component, budgets[index], componentModes[index]),
  );

  const truncatedFirst = truncatedComponents[0];
  const truncatedEnd = truncatedComponents.slice(1).join(separator);
  const result = `${root}${truncatedFirst}${separator}...${separator}${truncatedEnd}`;

  if (result.length > maxLen) {
    return trailingFallback();
  }

  return result;
}

/**
 * Calculates the relative path from a root directory to a target path.
 * If targetPath is relative, it is returned as-is.
 * Returns '.' if the target path is the same as the root directory.
 *
 * @param targetPath The absolute or relative path to make relative.
 * @param rootDirectory The absolute path of the directory to make the target path relative to.
 * @returns The relative path from rootDirectory to targetPath.
 */
export function makeRelative(
  targetPath: string,
  rootDirectory: string,
): string {
  if (!path.isAbsolute(targetPath)) {
    return targetPath;
  }
  const resolvedRootDirectory = path.resolve(rootDirectory);
  const relativePath = path.relative(resolvedRootDirectory, targetPath);

  // If the paths are the same, path.relative returns '', return '.' instead
  return relativePath || '.';
}

/**
 * Escape paths for at-commands.
 *
 *  - Windows: double quoted if they contain special chars, otherwise bare
 *  - POSIX: backslash-escaped
 */
export function escapePath(filePath: string): string {
  if (process.platform === 'win32') {
    // Windows: Double quote if it contains special chars
    if (/[\s&()[\]{}^=;!'+,`~%$@#]/.test(filePath)) {
      return `"${filePath}"`;
    }
    return filePath;
  } else {
    // POSIX: Backslash escape
    return filePath.replace(/([ \t()[\]{};|*?$`'"#&<>!~\\])/g, '\\$1');
  }
}

/**
 * Unescapes paths for at-commands.
 *
 *  - Windows: double quoted if they contain special chars, otherwise bare
 *  - POSIX: backslash-escaped
 */
export function unescapePath(filePath: string): string {
  if (process.platform === 'win32') {
    if (
      filePath.length >= 2 &&
      filePath.startsWith('"') &&
      filePath.endsWith('"')
    ) {
      return filePath.slice(1, -1);
    }
    return filePath;
  } else {
    return filePath.replace(/\\(.)/g, '$1');
  }
}

/**
 * Generates a unique hash for a project based on its root path.
 * @param projectRoot The absolute path to the project's root directory.
 * @returns A SHA256 hash of the project root path.
 */
export function getProjectHash(projectRoot: string): string {
  return crypto.createHash('sha256').update(projectRoot).digest('hex');
}

/**
 * Normalizes a path for reliable comparison across platforms.
 * - Resolves to an absolute path.
 * - Converts all path separators to forward slashes.
 * - On Windows, converts to lowercase for case-insensitivity.
 */
export function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  const normalized = resolved.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Checks if a path is a subpath of another path.
 * @param parentPath The parent path.
 * @param childPath The child path.
 * @returns True if childPath is a subpath of parentPath, false otherwise.
 */
export function isSubpath(parentPath: string, childPath: string): boolean {
  const isWindows = process.platform === 'win32';
  const pathModule = isWindows ? path.win32 : path;

  // On Windows, path.relative is case-insensitive. On POSIX, it's case-sensitive.
  const relative = pathModule.relative(parentPath, childPath);

  return (
    !relative.startsWith(`..${pathModule.sep}`) &&
    relative !== '..' &&
    !pathModule.isAbsolute(relative)
  );
}

/**
 * Resolves a path to its real path, sanitizing it first.
 * - Removes 'file://' protocol if present.
 * - Decodes URI components (e.g. %20 -> space).
 * - Resolves symbolic links using fs.realpathSync.
 *
 * @param pathStr The path string to resolve.
 * @returns The resolved real path.
 */
export function resolveToRealPath(pathStr: string): string {
  let resolvedPath = pathStr;

  try {
    if (resolvedPath.startsWith('file://')) {
      resolvedPath = fileURLToPath(resolvedPath);
    }

    resolvedPath = decodeURIComponent(resolvedPath);
  } catch (_e) {
    // Ignore error (e.g. malformed URI), keep path from previous step
  }

  return robustRealpath(path.resolve(resolvedPath));
}

function robustRealpath(p: string, visited = new Set<string>()): string {
  const key = process.platform === 'win32' ? p.toLowerCase() : p;
  if (visited.has(key)) {
    throw new Error(`Infinite recursion detected in robustRealpath: ${p}`);
  }
  visited.add(key);
  try {
    return fs.realpathSync(p);
  } catch (e: unknown) {
    if (
      e &&
      typeof e === 'object' &&
      'code' in e &&
      (e.code === 'ENOENT' || e.code === 'EISDIR')
    ) {
      try {
        const stat = fs.lstatSync(p);
        if (stat.isSymbolicLink()) {
          const target = fs.readlinkSync(p);
          const resolvedTarget = path.resolve(path.dirname(p), target);
          return robustRealpath(resolvedTarget, visited);
        }
      } catch (lstatError: unknown) {
        // Not a symlink, or lstat failed. Re-throw if it's not an expected
        // ENOENT (e.g., a permissions error), otherwise resolve parent.
        if (
          !(
            lstatError &&
            typeof lstatError === 'object' &&
            'code' in lstatError &&
            (lstatError.code === 'ENOENT' || lstatError.code === 'EISDIR')
          )
        ) {
          throw lstatError;
        }
      }
      const parent = path.dirname(p);
      if (parent === p) return p;
      return path.join(robustRealpath(parent, visited), path.basename(p));
    }
    throw e;
  }
}
