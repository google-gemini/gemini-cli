/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function replaceWithContext(
  filePath: string,
  oldPattern: string,
  newText: string,
  config: any,
  lookbehind?: string,
  lookahead?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            let pattern = oldPattern;
            if (lookbehind) {
              pattern = `(?<=${lookbehind})${pattern}`;
            }
            if (lookahead) {
              pattern = `${pattern}(?=${lookahead})`;
            }
            const regex = new RegExp(pattern, 's');
            if (!regex.test(data)) {
              reject(
                new Error(`Pattern '${oldPattern}' not found in ${filePath}`),
              );
            } else {
              const newContent = data.replace(regex, newText);
              fs.writeFile(resolvedPath, newContent, 'utf-8', (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(`Replaced pattern with context in ${filePath}`);
                }
              });
            }
          }
        });
      })
      .catch(reject);
  });
}
