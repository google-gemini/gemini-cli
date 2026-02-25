/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir, debugLogger } from '@google/gemini-cli-core';

/**
 * Default playgrounds folder path for different platforms.
 * Users can override this with the ANTIGRAVITY_PLAYGROUNDS_PATH environment variable.
 */
function getDefaultPlaygroundsPath(): string {
  const platform = process.platform;
  const home = homedir();

  switch (platform) {
    case 'darwin':
      return path.join(
        home,
        'Library',
        'Application Support',
        'Antigravity',
        'User',
        'playgrounds',
      );
    case 'win32':
      return path.join(
        process.env['APPDATA'] || path.join(home, 'AppData', 'Roaming'),
        'Antigravity',
        'User',
        'playgrounds',
      );
    default:
      // Linux and other Unix-like systems
      return path.join(
        process.env['XDG_CONFIG_HOME'] || path.join(home, '.config'),
        'Antigravity',
        'User',
        'playgrounds',
      );
  }
}

/**
 * Gets the playgrounds folder path from environment variable or uses default.
 */
export function getPlaygroundsPath(): string {
  return (
    process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'] || getDefaultPlaygroundsPath()
  );
}

/**
 * Generates a unique playground directory name using timestamp and random suffix.
 * Format: playground-YYYYMMDD-HHMMSS-XXXXXX
 */
export function generatePlaygroundName(): string {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\..+/, '')
    .substring(0, 14); // YYYYMMDDHHMMSS

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `playground-${timestamp}-${randomSuffix}`;
}

/**
 * Creates a new playground directory and returns the full path.
 * @returns The full path to the created playground directory.
 * @throws Error if the directory cannot be created.
 */
export function createPlaygroundDirectory(): string {
  const playgroundsPath = getPlaygroundsPath();
  const playgroundName = generatePlaygroundName();
  const fullPath = path.join(playgroundsPath, playgroundName);

  debugLogger.log(`Creating playground directory: ${fullPath}`);

  // Ensure the parent playgrounds directory exists
  if (!fs.existsSync(playgroundsPath)) {
    fs.mkdirSync(playgroundsPath, { recursive: true });
  }

  // Create the new playground directory
  fs.mkdirSync(fullPath, { recursive: true });

  return fullPath;
}

/**
 * Sets up a new playground environment by creating the directory and changing to it.
 * @returns The path of the created playground directory.
 */
export function setupPlayground(): string {
  const playgroundPath = createPlaygroundDirectory();
  process.chdir(playgroundPath);
  debugLogger.log(`Changed working directory to: ${playgroundPath}`);
  return playgroundPath;
}
