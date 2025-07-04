/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function dryRunReplace(
  filePath: string,
  pattern: string,
  replacement: string,
  config: any,
  regex: boolean = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const newContent = regex
              ? data.replace(new RegExp(pattern, 'g'), replacement)
              : data.replace(pattern, replacement);
            resolve(`[Dry Run] Would update ${filePath}:\n${newContent}`);
          }
        });
      })
      .catch(reject);
  });
}
