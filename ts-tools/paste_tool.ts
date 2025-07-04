/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkFilePermission } from './check_file_permission';

export async function pasteFiles(
  filePaths: string[],
  config: any,
): Promise<string> {
  await Promise.all(
    filePaths.map((f) => checkFilePermission(f, 'read', config)),
  );
  const resolvedPaths = filePaths.map((f) => path.resolve(f));
  const files = resolvedPaths.map((p) => fs.createReadStream(p, 'utf-8'));
  // This is a simplified implementation. A more robust solution would handle
  // streams and backpressure properly.
  const lines: string[][] = [];
  for (const file of files) {
    const fileLines = (await streamToLines(file)).map((l) => l.trim());
    lines.push(fileLines);
  }
  const result: string[] = [];
  const maxLines = Math.max(...lines.map((l) => l.length));
  for (let i = 0; i < maxLines; i++) {
    const row = lines.map((l) => l[i] || '');
    result.push(row.join('\t'));
  }
  return result.join('\n');
}

function streamToLines(stream: fs.ReadStream): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf-8').split('\n')),
    );
  });
}
