/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildRepoTree } from './repoTraversal.js';
import os from 'node:os';

describe('repoTraversal', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gemini-cli-repoTraversal-test-'),
    );

    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'ignored_custom.txt\n',
    );
    await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content');
    await fs.writeFile(path.join(tempDir, 'ignored_custom.txt'), 'content');

    await fs.mkdir(path.join(tempDir, 'dir1'));
    await fs.writeFile(path.join(tempDir, 'dir1', 'file2.ts'), 'content');

    // node_modules is part of DEFAULT_FILE_EXCLUDES
    await fs.mkdir(path.join(tempDir, 'dir1', 'node_modules'));
    await fs.writeFile(
      path.join(tempDir, 'dir1', 'node_modules', 'ignored.js'),
      'content',
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should build a tree ignoring files specified in .gitignore and defaults', async () => {
    const tree = await buildRepoTree({ projectRoot: tempDir });

    expect(tree).toBeDefined();
    expect(tree.isDirectory).toBe(true);

    const childNames = tree.children?.map((c) => c.name);

    expect(childNames).toContain('dir1');
    expect(childNames).toContain('file1.txt');
    expect(childNames).toContain('.gitignore');

    // Should ignore based on .gitignore
    expect(childNames).not.toContain('ignored_custom.txt');

    const dir1Node = tree.children?.find((c) => c.name === 'dir1');
    expect(dir1Node).toBeDefined();
    expect(dir1Node?.children?.map((c) => c.name)).toContain('file2.ts');

    // Should ignore node_modules based on DEFAULT_FILE_EXCLUDES
    expect(dir1Node?.children?.map((c) => c.name)).not.toContain(
      'node_modules',
    );
  });
});
