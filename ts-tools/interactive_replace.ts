/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { checkFilePermission } from './check_file_permission';

export function replaceInteractive(
  filePath: string,
  oldPattern: string,
  newText: string,
  config: any,
): Promise<string> {
  return new Promise((resolve, reject) => {
    checkFilePermission(filePath, 'write', config)
      .then(() => {
        const resolvedPath = path.resolve(filePath);
        fs.readFile(resolvedPath, 'utf-8', (err, data) => {
          if (err) {
            reject(err);
          } else {
            const regex = new RegExp(oldPattern, 's');
            const match = data.match(regex);
            if (!match) {
              reject(
                new Error(`Pattern '${oldPattern}' not found in ${filePath}`),
              );
              return;
            }
            console.log(`Preview:\nOld:\n${match[0]}\nNew:\n${newText}`);
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });
            rl.question('Apply replacement? (y/n): ', (answer) => {
              if (answer.toLowerCase() !== 'y') {
                resolve('Replacement cancelled');
              } else {
                const newContent = data.replace(regex, newText);
                fs.writeFile(resolvedPath, newContent, 'utf-8', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(`Applied interactive replacement in ${filePath}`);
                  }
                });
              }
              rl.close();
            });
          }
        });
      })
      .catch(reject);
  });
}
