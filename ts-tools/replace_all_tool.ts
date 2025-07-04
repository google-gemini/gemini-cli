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

export async function replaceAll(
  dirPath: string,
  pattern: string,
  replacement: string,
  config: any,
  regex: boolean = false,
): Promise<string> {
  await checkFilePermission(dirPath, 'write', config);
  const resolvedPath = path.resolve(dirPath);
  const results: string[] = [];
  for await (const p of walk(resolvedPath)) {
    await checkFilePermission(p, 'write', config);
    const content = await fs.promises.readFile(p, 'utf-8');
    const newContent = regex
      ? content.replace(new RegExp(pattern, 'g'), replacement)
      : content.replace(pattern, replacement);
    await fs.promises.writeFile(p, newContent, 'utf-8');
    results.push(`Updated ${p}`);
  }
  return results.join('\n');
}
