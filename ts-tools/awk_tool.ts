/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export async function awkFile(
  filePath: string,
  pattern: string,
  action: (line: string) => string,
  config: any,
): Promise<string> {
  await checkFilePermission(filePath, 'write', config);
  const resolvedPath = path.resolve(filePath);
  const data = await fs.readFile(resolvedPath, 'utf-8');
  const lines = data.split('\n');
  const result: string[] = [];
  const regex = new RegExp(pattern);
  for (const line of lines) {
    if (regex.test(line)) {
      result.push(action(line));
    } else {
      result.push(line);
    }
  }
  await fs.writeFile(resolvedPath, result.join('\n'), 'utf-8');
  return `Processed ${filePath} with awk`;
}
