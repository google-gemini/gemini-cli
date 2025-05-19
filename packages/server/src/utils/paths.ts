/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import os from 'os';

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
  const startComponent = root + firstDir;

  const endPartSegments: string[] = [];
  // Base length: startComponent + separator + "..."
  let currentLength = startComponent.length + separator.length + 3;

  // Iterate backwards through segments (excluding the first one)
  for (let i = segments.length - 1; i >= 1; i--) {
    const segment = segments[i];
    // Length needed if we add this segment: current + separator + segment
    const lengthWithSegment = currentLength + separator.length + segment.length;

    if (lengthWithSegment <= maxLen) {
      endPartSegments.unshift(segment); // Add to the beginning of the end part
      currentLength = lengthWithSegment;
    } else {
      // Adding this segment would exceed maxLen
      break;
    }
  }

  // Construct the final path
  let result = startComponent + separator + '...';
  if (endPartSegments.length > 0) {
    result += separator + endPartSegments.join(separator);
  }

  // As a final check, if the result is somehow still too long (e.g., startComponent + ... is too long)
  // fallback to simple truncation of the original path
  if (result.length > maxLen) {
    const keepLen = Math.floor((maxLen - 3) / 2);
    if (keepLen <= 0) {
      return filePath.substring(0, maxLen - 3) + '...';
    }
    const start = filePath.substring(0, keepLen);
    const end = filePath.substring(filePath.length - keepLen);
    return `${start}...${end}`;
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
