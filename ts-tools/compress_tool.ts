/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { checkFilePermission } from './check_file_permission';

export function compressFiles(
  filePaths: string[],
  zipPath: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(zipPath, 'write', config)
      .then(() => {
        const resolvedZipPath = path.resolve(zipPath);
        const output = fs.createWriteStream(resolvedZipPath);
        const archive = archiver('zip', {
          zlib: { level: 9 },
        });

        output.on('close', () => {
          resolve(`Compressed to ${zipPath}`);
        });

        archive.on('error', (err) => {
          reject(err);
        });

        archive.pipe(output);

        Promise.all(
          filePaths.map((filePath) =>
            checkFilePermission(filePath, 'read', config).then(() => {
              const resolvedPath = path.resolve(filePath);
              archive.file(resolvedPath, { name: path.basename(resolvedPath) });
            }),
          ),
        )
          .then(() => archive.finalize())
          .catch(reject);
      })
      .catch(reject);
  });
}
