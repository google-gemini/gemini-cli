/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GEMINI_DIR } from './paths.js';

const INTERNAL_DIR = 'tmp';

/**
 * Get the path to the tmp directory within .gemini
 */
export function getInternalDir(): string {
  return path.join(os.homedir(), GEMINI_DIR, INTERNAL_DIR);
}

/**
 * Ensures the tmp directory exists
 */
export function ensureInternalDirExists(): void {
  const tmpDir = getInternalDir();
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
}

/**
 * Migrates a file from the old location to the new location
 * @param oldPath The current path of the file
 * @param newPath The new path where the file should be moved
 * @returns true if migration was performed, false if no migration was needed
 */
function migrateFile(oldPath: string, newPath: string): boolean {
  try {
    if (fs.existsSync(oldPath)) {
      ensureInternalDirExists();

      if (fs.existsSync(newPath)) {
        // If both paths exist, remove the old file
        fs.rmSync(oldPath);
        console.debug(
          `Removed duplicate file ${path.basename(oldPath)} from old location`,
        );
      } else {
        // If only old path exists, migrate it
        fs.renameSync(oldPath, newPath);
        console.debug(`Migrated ${path.basename(oldPath)} to tmp directory`);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.debug(`Failed to migrate ${path.basename(oldPath)}:`, error);
    return false;
  }
}

/**
 * Migrates all files from the data directory to the tmp directory
 * and cleans up the empty data directory afterwards
 */
function migrateDataDirectory(): void {
  const geminiDir = path.join(os.homedir(), GEMINI_DIR);
  const dataDir = path.join(geminiDir, 'data');
  const tmpDir = getInternalDir();

  try {
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);

      // Migrate any remaining files from data to tmp directory
      for (const file of files) {
        const oldPath = path.join(dataDir, file);
        const newPath = path.join(tmpDir, file);
        migrateFile(oldPath, newPath);
      }

      // After migration, check if directory is empty and remove it
      const remainingFiles = fs.readdirSync(dataDir);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(dataDir);
        console.debug('Removed empty data directory');
      }
    }
  } catch (_error) {
    // Ignore errors when cleaning up
  }
}

/**
 * Performs migration of internal files to the tmp subdirectory
 * This function is idempotent and can be called multiple times safely
 */
export function migrateInternalFiles(): void {
  const geminiDir = path.join(os.homedir(), GEMINI_DIR);
  const tmpDir = getInternalDir();

  const filesToMigrate = [
    {
      filename: 'installation_id',
      oldPath: path.join(geminiDir, 'installation_id'),
      newPath: path.join(tmpDir, 'installation_id'),
    },
    {
      filename: 'google_accounts.json',
      oldPath: path.join(geminiDir, 'google_accounts.json'),
      newPath: path.join(tmpDir, 'google_accounts.json'),
    },
    {
      filename: 'oauth_creds.json',
      oldPath: path.join(geminiDir, 'oauth_creds.json'),
      newPath: path.join(tmpDir, 'oauth_creds.json'),
    },
  ];

  for (const file of filesToMigrate) {
    migrateFile(file.oldPath, file.newPath);
  }

  migrateDataDirectory();
}

/**
 * Gets the file path for a given filename in the internal directory, after ensuring migrations
 * @param filename The name of the file
 * @returns The path to the file in the internal directory
 */
function getInternalFilePath(filename: string): string {
  migrateInternalFiles();
  return path.join(getInternalDir(), filename);
}

/**
 * Gets the installation ID file path, checking both old and new locations
 * @returns The path to the installation_id file
 */
export function getInstallationIdPath(): string {
  return getInternalFilePath('installation_id');
}

/**
 * Gets the Google accounts file path, checking both old and new locations
 * @returns The path to the google_accounts.json file
 */
export function getGoogleAccountsPath(): string {
  return getInternalFilePath('google_accounts.json');
}

/**
 * Gets the OAuth credentials file path, checking both old and new locations
 * @returns The path to the oauth_creds.json file
 */
export function getOAuthCredsPath(): string {
  return getInternalFilePath('oauth_creds.json');
}
