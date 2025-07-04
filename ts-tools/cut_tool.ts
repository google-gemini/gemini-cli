/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function cutFile(
  filePath: string,
  delimiter: string,
  fields: number[],
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const lines = data.split('\n');
            const result: string[] = [];
            for (const line of lines) {
              const parts = line.split(delimiter);
              const selected = fields.map((i) => parts[i - 1]).filter(Boolean);
              result.push(selected.join(delimiter));
            }
            resolve(result.join('\n'));
          }
        });
      })
      .catch(reject);
  });
}
