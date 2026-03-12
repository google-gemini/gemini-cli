/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdir, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import type { FileNode } from '../ui/RepoVisualizer.js';

const IGNORE = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  'coverage',
  '.turbo',
  'build',
  'out',
]);

export async function buildTree(
  dirPath: string,
  signal?: AbortSignal,
): Promise<FileNode> {
  if (signal?.aborted) throw new Error('Aborted');

  const name = basename(dirPath);
  const info = await stat(dirPath);

  if (!info.isDirectory()) {
    const ext = extname(name).slice(1).toLowerCase();
    const size = `${(info.size / 1024).toFixed(1)}kb`;
    return { name, type: 'file', size, lang: ext || 'txt' };
  }

  const entries = await readdir(dirPath, { withFileTypes: true });

  const children = await Promise.all(
    entries
      .filter((e) => !IGNORE.has(e.name))
      .sort((a, b) => {
        // Directories first, then files, both alphabetically
        if (a.isDirectory() !== b.isDirectory())
          return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => buildTree(join(dirPath, e.name), signal)),
  );

  return { name, type: 'dir', children };
}
