/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { checkFilePermission } from './check_file_permission';

export function decompressFiles(
  zipPath: string,
  extractPath: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(zipPath, 'read', config)
      .then(() => {
        const resolvedZipPath = path.resolve(zipPath);
        const resolvedExtractPath = path.resolve(extractPath);
        yauzl.open(resolvedZipPath, { lazyEntries: true }, (err, zipfile) => {
          if (err || !zipfile) {
            reject(err || new Error('Failed to open zip file'));
            return;
          }
          zipfile.readEntry();
          zipfile.on('entry', (entry) => {
            const entryPath = path.join(resolvedExtractPath, entry.fileName);
            if (/\/$/.test(entry.fileName)) {
              fs.mkdir(entryPath, { recursive: true }, (err) => {
                if (err) reject(err);
                zipfile.readEntry();
              });
            } else {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err || !readStream) {
                  reject(err || new Error('Failed to read zip entry'));
                  return;
                }
                const writeStream = fs.createWriteStream(entryPath);
                readStream.pipe(writeStream);
                writeStream.on('close', () => zipfile.readEntry());
                writeStream.on('error', reject);
              });
            }
          });
          zipfile.on('end', () => resolve(`Extracted to ${extractPath}`));
        });
      })
      .catch(reject);
  });
}
