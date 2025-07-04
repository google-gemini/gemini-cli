/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function showMetadata(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.stat(resolvedPath, (err, stats) => {
          if (err) {
            reject(err);
          } else {
            const size = stats.size;
            const mtime = stats.mtime.toISOString();
            resolve(
              `File: ${resolvedPath}\nSize: ${size} bytes\nModified: ${mtime}`,
            );
          }
        });
      })
      .catch(reject);
  });
}
