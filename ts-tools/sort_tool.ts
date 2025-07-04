/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function sortFile(
  filePath: string,
  config: any,
  reverse: boolean = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const lines = data.split('\n');
            lines.sort();
            if (reverse) {
              lines.reverse();
            }
            fs.writeFile(resolvedPath, lines.join('\n'), 'utf-8', (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(`Sorted ${filePath}`);
              }
            });
          }
        });
      })
      .catch(reject);
  });
}
