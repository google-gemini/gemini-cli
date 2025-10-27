/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';

/**
 * Safely writes data to a file. If the file is a symlink, it writes to the
 * symlink's target.
 *
 * @param filePath The path to the file to write to.
 * @param data The data to write to the file.
 * @param options The options for writing the file.
 */
export function safeWriteFileSync(
  filePath: string,
  data: string,
  options?: fs.WriteFileOptions,
): void {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      const targetPath = fs.readlinkSync(filePath);
      fs.writeFileSync(targetPath, data, options);
    } else {
      fs.writeFileSync(filePath, data, options);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, so just write it.
      fs.writeFileSync(filePath, data, options);
    } else {
      throw error;
    }
  }
}
