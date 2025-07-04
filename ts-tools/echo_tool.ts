/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function echoText(
  text: string,
  filePath?: string,
  config?: any,
  append: boolean = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (filePath && config) {
      checkFilePermission(filePath, 'write', config)
        .then(() => {
          const resolvedPath = path.resolve(filePath);
          const mode = append ? 'a' : 'w';
          fs.writeFile(resolvedPath, text + '\n', { mode }, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve(`Wrote to ${filePath}`);
            }
          });
        })
        .catch(reject);
    } else {
      resolve(text);
    }
  });
}
