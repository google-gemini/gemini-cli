/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function mkdirDir(dirPath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(dirPath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(dirPath);
        fs.mkdir(resolvedPath, { recursive: true }, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(`Created directory ${dirPath}`);
          }
        });
      })
      .catch(reject);
  });
}
