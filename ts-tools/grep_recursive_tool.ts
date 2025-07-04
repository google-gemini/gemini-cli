/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const d of await fs.promises.opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile()) yield entry;
  }
}

export async function grepRecursive(
  dirPath: string,
  pattern: string,
  config: any,
  regex: boolean = false,
): Promise<string> {
  await checkFilePermission(dirPath, 'read', config);
  const resolvedPath = path.resolve(dirPath);
  const result: string[] = [];
  const re = regex ? new RegExp(pattern) : null;

  for await (const p of walk(resolvedPath)) {
    await checkFilePermission(p, 'read', config);
    const data = await fs.promises.readFile(p, 'utf-8');
    const lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (re) {
        if (re.test(line)) {
          result.push(`${p}:${i + 1}:${line}`);
        }
      } else {
        if (line.includes(pattern)) {
          result.push(`${p}:${i + 1}:${line}`);
        }
      }
    }
  }
  return result.length > 0 ? result.join('\n') : 'No matches found';
}
