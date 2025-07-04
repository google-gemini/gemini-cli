/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function processFileList(
  listFile: string,
  toolFunc: (filePath: string, config: any, ...args: any[]) => Promise<string>,
  config: any,
  ...args: any[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(listFile, 'read', config)
      .then(() => {
        const resolvedPath = path.resolve(listFile);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const files = data.split('\n').filter((line) => line.trim() !== '');
            const promises = files.map((file) =>
              toolFunc(file, config, ...args),
            );
            Promise.all(promises)
              .then((results) => resolve(results.join('\n')))
              .catch(reject);
          }
        });
      })
      .catch(reject);
  });
}
