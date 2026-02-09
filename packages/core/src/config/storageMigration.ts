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
      if (!fs.existsSync(oldPath)) {
        return;
      }

      if (fs.existsSync(newPath)) {
        const files = await fs.promises.readdir(newPath);
        // If it contains more than just the .project_root file, it's not a fresh directory from ProjectRegistry
        if (
          files.length > 1 ||
          (files.length === 1 && files[0] !== '.project_root')
        ) {
          return;
        }
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
