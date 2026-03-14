/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTree } from './buildTree.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Create a real temporary directory tree so we don't need mock-fs,
 * which has compatibility issues with newer Node versions.
 */
async function makeTmpRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'repo-vis-test-'));

  // Structure:
  //   root/
  //     src/
  //       main.ts
  //     README.md
  //     package.json
  //     node_modules/   ← should be ignored
  //       lodash/
  //     .git/           ← should be ignored

  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src', 'main.ts'), 'export {}');
  await fs.writeFile(path.join(root, 'README.md'), '# Hello');
  await fs.writeFile(path.join(root, 'package.json'), '{}');
  await fs.mkdir(path.join(root, 'node_modules', 'lodash'), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, '.git'));

  return root;
}

async function removeTmpRepo(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('buildTree', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await makeTmpRepo();
  });

  afterEach(async () => {
    await removeTmpRepo(tmpRoot);
  });

  it('returns a dir node for the root', async () => {
    const tree = await buildTree(tmpRoot);
    expect(tree.type).toBe('dir');
    expect(tree.name).toBe(path.basename(tmpRoot));
  });

  it('ignores node_modules', async () => {
    const tree = await buildTree(tmpRoot);
    const names = tree.children?.map((c) => c.name) ?? [];
    expect(names).not.toContain('node_modules');
  });

  it('ignores .git', async () => {
    const tree = await buildTree(tmpRoot);
    const names = tree.children?.map((c) => c.name) ?? [];
    expect(names).not.toContain('.git');
  });

  it('includes src directory', async () => {
    const tree = await buildTree(tmpRoot);
    const names = tree.children?.map((c) => c.name) ?? [];
    expect(names).toContain('src');
  });

  it('includes README.md and package.json', async () => {
    const tree = await buildTree(tmpRoot);
    const names = tree.children?.map((c) => c.name) ?? [];
    expect(names).toContain('README.md');
    expect(names).toContain('package.json');
  });

  it('puts directories before files', async () => {
    const tree = await buildTree(tmpRoot);
    const first = tree.children?.[0];
    expect(first?.type).toBe('dir');
  });

  it('assigns correct lang from file extension', async () => {
    const tree = await buildTree(tmpRoot);
    const src = tree.children?.find((c) => c.name === 'src');
    const mainTs = src?.children?.find((c) => c.name === 'main.ts');
    expect(mainTs?.lang).toBe('ts');
  });

  it('assigns lang "md" to .md files', async () => {
    const tree = await buildTree(tmpRoot);
    const readme = tree.children?.find((c) => c.name === 'README.md');
    expect(readme?.lang).toBe('md');
  });

  it('populates size string on file nodes', async () => {
    const tree = await buildTree(tmpRoot);
    const readme = tree.children?.find((c) => c.name === 'README.md');
    expect(typeof readme?.size).toBe('string');
    expect(readme?.size).toMatch(/kb$/);
  });

  it('recursively includes children of src', async () => {
    const tree = await buildTree(tmpRoot);
    const src = tree.children?.find((c) => c.name === 'src');
    const names = src?.children?.map((c) => c.name) ?? [];
    expect(names).toContain('main.ts');
  });

  it('throws when AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildTree(tmpRoot, controller.signal)).rejects.toThrow(
      'Aborted',
    );
  });

  it('throws for a path that does not exist', async () => {
    await expect(
      buildTree('/this/path/does/not/exist/at/all'),
    ).rejects.toThrow();
  });
});
