/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processImports } from './memoryImportProcessor.js';
import { vol } from 'memfs';

vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

describe('memoryImportProcessor', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should process a basic import', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': 'Hello @./other.md',
      '/project/other.md': 'World',
    });

    const result = await processImports('/project/GEMINI.md', '/project', true);
    expect(result.content).toBe('Hello World');
    expect(result.importTree).toEqual({
      path: '/project/GEMINI.md',
      children: [{ path: '/project/other.md', children: [] }],
    });
  });

  it('should handle nested imports', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': '@./level1.md',
      '/project/level1.md': 'Level 1 imports @./level2.md',
      '/project/level2.md': 'Level 2 content',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('Level 1 imports Level 2 content');
    expect(result.importTree).toEqual({
      path: '/project/GEMINI.md',
      children: [
        {
          path: '/project/level1.md',
          children: [{ path: '/project/level2.md', children: [] }],
        },
      ],
    });
  });

  it('should ignore imports inside code blocks', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': '```\n@./ignored.md\n```',
      '/project/ignored.md': 'SHOULD NOT BE INCLUDED',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toContain('@./ignored.md');
    expect(result.content).not.toContain('SHOULD NOT BE INCLUDED');
    expect(result.importTree.children).toHaveLength(0);
  });

  it('should ignore imports inside inline code spans', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': 'This is some code: `@./ignored.md`',
      '/project/ignored.md': 'SHOULD NOT BE INCLUDED',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toContain('@./ignored.md');
    expect(result.content).not.toContain('SHOULD NOT BE INCLUDED');
    expect(result.importTree.children).toHaveLength(0);
  });

  it('should silently ignore missing files', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': 'Hello @./nonexistent.md',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('Hello ');
    expect(result.importTree.children).toHaveLength(0);
  });

  it('should silently ignore directories', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': 'Hello @./mydir',
      '/project/mydir/file.txt': 'content',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('Hello ');
    expect(result.importTree.children).toHaveLength(0);
  });

  it('should not import the same file twice', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': '@./a.md and @./b.md',
      '/project/a.md': 'Content A imports @./b.md',
      '/project/b.md': 'Content B',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('Content A imports Content B and ');
    expect(result.importTree).toEqual({
      path: '/project/GEMINI.md',
      children: [
        {
          path: '/project/a.md',
          children: [{ path: '/project/b.md', children: [] }],
        },
      ],
    });
  });

  it('should stop at max depth', async () => {
    vol.fromJSON({
      '/project/1.md': '@./2.md',
      '/project/2.md': '@./3.md',
      '/project/3.md': '@./4.md',
      '/project/4.md': '@./5.md',
      '/project/5.md': 'Level 5 @./6.md',
      '/project/6.md': 'SHOULD NOT BE INCLUDED',
    });

    const result = await processImports('/project/1.md', '/project');
    expect(result.content).toBe('Level 5 ');
    expect(
      result.importTree.children[0].children[0].children[0].children[0]
        .children,
    ).toHaveLength(0);
  });

  it('should not allow path traversal', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': '@../secret.md',
      '/secret.md': 'SECRET CONTENT',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('');
    expect(result.importTree.children).toHaveLength(0);
  });

  it('should handle escaped spaces in paths', async () => {
    vol.fromJSON({
      '/project/GEMINI.md': 'Hello @./my\\ file.md',
      '/project/my file.md': 'World',
    });

    const result = await processImports('/project/GEMINI.md', '/project');
    expect(result.content).toBe('Hello World');
    expect(result.importTree.children[0].path).toBe('/project/my file.md');
  });
});
