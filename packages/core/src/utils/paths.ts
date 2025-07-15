/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'os';
import * as crypto from 'crypto';

export const GEMINI_DIR = '.gemini';
export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
const TMP_DIR_NAME = 'tmp';

/**
 * Replaces the home directory with a tilde.
 * @param path - The path to tildeify.
 * @returns The tildeified path.
 */
export function tildeifyPath(path: string): string {
  const homeDir = os.homedir();
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

  const parsedPath = path.parse(filePath);
  const root = parsedPath.root;
  const separator = path.sep;

  // Get segments of the path *after* the root
  const relativePath = filePath.substring(root.length);
  const segments = relativePath.split(separator).filter((s) => s !== ''); // Filter out empty segments

  // Handle cases with no segments after root (e.g., "/", "C:\") or only one segment
  if (segments.length <= 1) {
    // Fallback to simple start/end truncation for very short paths or single segments
    const keepLen = Math.floor((maxLen - 3) / 2);
    // Ensure keepLen is not negative if maxLen is very small
    if (keepLen <= 0) {
      return filePath.substring(0, maxLen - 3) + '...';
    }
    const start = filePath.substring(0, keepLen);
    const end = filePath.substring(filePath.length - keepLen);
    return `${start}...${end}`;
  }

  const firstDir = segments[0];
  const lastSegment = segments[segments.length - 1];
  const startComponent = root + firstDir;

  const endPartSegments: string[] = [];
  // Base length: separator + "..." + lastDir
  let currentLength = separator.length + lastSegment.length;

  // Iterate backwards through segments (excluding the first one)
  for (let i = segments.length - 2; i >= 0; i--) {
    const segment = segments[i];
    // Length needed if we add this segment: current + separator + segment
    const lengthWithSegment = currentLength + separator.length + segment.length;

    if (lengthWithSegment <= maxLen) {
      endPartSegments.unshift(segment); // Add to the beginning of the end part
      currentLength = lengthWithSegment;
    } else {
      break;
    }
  }

  let result = endPartSegments.join(separator) + separator + lastSegment;

  if (currentLength > maxLen) {
    return result;
  }

  // Construct the final path
  result = startComponent + separator + result;

  // As a final check, if the result is somehow still too long
  // truncate the result string from the beginning, prefixing with "...".
  if (result.length > maxLen) {
    return '...' + result.substring(result.length - maxLen - 3);
  }

  return result;
}

/**
 * Calculates the relative path from a root directory to a target path.
 * Ensures both paths are resolved before calculating.
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
  const resolvedTargetPath = path.resolve(targetPath);
  const resolvedRootDirectory = path.resolve(rootDirectory);

  const relativePath = path.relative(resolvedRootDirectory, resolvedTargetPath);

  // If the paths are the same, path.relative returns '', return '.' instead
  return relativePath || '.';
}

/**
 * Escapes spaces in a file path.
 */
export function escapePath(filePath: string): string {
  let result = '';
  for (let i = 0; i < filePath.length; i++) {
    // Only escape spaces that are not already escaped.
    if (filePath[i] === ' ' && (i === 0 || filePath[i - 1] !== '\\')) {
      result += '\\ ';
    } else {
      result += filePath[i];
    }
  }
  return result;
}

/**
 * Unescapes spaces in a file path.
 */
export function unescapePath(filePath: string): string {
  return filePath.replace(/\\ /g, ' ');
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
 * Generates a unique temporary directory path for a project.
 * @param projectRoot The absolute path to the project's root directory.
 * @returns The path to the project's temporary directory.
 */
export function getProjectTempDir(projectRoot: string): string {
  const hash = getProjectHash(projectRoot);
  return path.join(os.homedir(), GEMINI_DIR, TMP_DIR_NAME, hash);
}
