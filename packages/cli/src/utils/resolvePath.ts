/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { homedir } from '@google/gemini-cli-core';
import path from 'node:path';

/**
 * Resolves paths starting with ~ or %userprofile% to the user's home directory.
 * Also normalizes the resulting path.
 */
export function resolvePath(inputPath: string): string {
  if (!inputPath) {
    return '';
  }

  let resolved = inputPath;

  // Handle ~ prefix
  if (inputPath === '~' || inputPath.startsWith('~/')) {
    resolved = path.join(homedir(), inputPath.slice(1));
  }
  // Handle %userprofile% prefix
  else if (inputPath.toLowerCase().startsWith('%userprofile%')) {
    resolved = path.join(homedir(), inputPath.slice('%userprofile%'.length));
  }

  return path.normalize(resolved);
}
