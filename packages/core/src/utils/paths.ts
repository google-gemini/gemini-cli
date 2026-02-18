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

export const GEMINI_DIR = '.gemini';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';

/**
 * Returns the home directory.
 * If GEMINI_CLI_HOME environment variable is set, it returns its value.
 * Otherwise, it returns the user's home directory.
 */
export function homedir(): string {
  const envHome = process.env['GEMINI_CLI_HOME'];
  if (envHome) {
    return envHome;
  }
  return os.homedir();
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
export function resolveToRealPath(path: string): string {
  let resolvedPath = path;

  try {
    if (resolvedPath.startsWith('file://')) {
      resolvedPath = fileURLToPath(resolvedPath);
    }

    resolvedPath = decodeURIComponent(resolvedPath);
  } catch (_e) {
    // Ignore error (e.g. malformed URI), keep path from previous step
  }

  try {
    return fs.realpathSync(resolvedPath);
  } catch (_e) {
    // If realpathSync fails, it might be because the path doesn't exist.
    // In that case, we can fall back to the path processed.
    return resolvedPath;
  }
}
