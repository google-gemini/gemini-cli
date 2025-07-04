/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function base64Encode(filePath: string, config: any): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, (err, data) => {
          if (err) {
            reject(err);
          } else {
            resolve(data.toString('base64'));
          }
        });
      })
      .catch(reject);
  });
}
