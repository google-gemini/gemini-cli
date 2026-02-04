/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Migration utility to move data from old hash-based directories to new slug-based directories.
 */
export class StorageMigration {
  /**
   * Migrates a directory from an old path to a new path if the old one exists and the new one doesn't.
   * @param oldPath The old directory path (hash-based).
   * @param newPath The new directory path (slug-based).
   */
  static async migrateDirectory(
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    try {
      // If the new path already exists, we consider migration done or skipped to avoid overwriting.
      // If the old path doesn't exist, there's nothing to migrate.
      if (fs.existsSync(newPath) || !fs.existsSync(oldPath)) {
        return;
      }

      // Ensure the parent directory of the new path exists
      const parentDir = path.dirname(newPath);
      await fs.promises.mkdir(parentDir, { recursive: true });

      // Copy (safer and handles cross-device moves)
      await fs.promises.cp(oldPath, newPath, { recursive: true });
    } catch (e) {
      debugLogger.debug(
        `Storage Migration: Failed to move ${oldPath} to ${newPath}:`,
        e,
      );
    }
  }
}
