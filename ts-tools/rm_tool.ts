/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function rmFile(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.unlink(resolvedPath, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(`Removed ${filePath}`);
          }
        });
      })
      .catch(reject);
  });
}
