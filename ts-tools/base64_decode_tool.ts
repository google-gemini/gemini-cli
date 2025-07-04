/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export function base64Decode(
  filePath: string,
  outputPath: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    Promise.all([
      checkFilePermission(filePath, 'read', config),
      checkFilePermission(outputPath, 'write', config),
    ])
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        const resolvedOutPath = path.resolve(outputPath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const decoded = Buffer.from(data, 'base64');
            fs.writeFile(resolvedOutPath, decoded, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve(`Decoded to ${outputPath}`);
              }
            });
          }
        });
      })
      .catch(reject);
  });
}
