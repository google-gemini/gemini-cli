/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { exec } from 'child_process';
import { checkFilePermission } from '../services/filePermissionService';

export async function watchFile(
  filePath: string,
  command: string,
  interval: number,
  config: unknown,
): Promise<void> {
  if (!(await checkFilePermission(filePath, 'read', config))) {
    throw new Error(`Read access denied for ${filePath}`);
  }

  const resolvedPath = resolve(filePath);
  const stats = await fs.stat(resolvedPath);

  if (!stats.isFile()) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  let lastMtime = stats.mtimeMs;

  const intervalId = setInterval(async () => {
    try {
      const currentStats = await fs.stat(resolvedPath);
      if (currentStats.mtimeMs !== lastMtime) {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return;
          }
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
        });
        lastMtime = currentStats.mtimeMs;
      }
    } catch (error) {
      console.error(`Error watching file: ${error}`);
      clearInterval(intervalId);
    }
  }, interval * 1000);
}
