/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { flattenTree, countNodes } from './RepoVisualizer.js';
import type { FileNode } from './RepoVisualizer.js';

// ─────────────────────────────────────────────
// Mock heavy deps that visualize.ts pulls in
// Must be declared before any import of visualize.ts
// ─────────────────────────────────────────────

vi.mock('ink', () => ({
  render: vi
    .fn()
    .mockReturnValue({ waitUntilExit: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('./RepoVisualizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./RepoVisualizer.js')>();
  return {
    ...actual,
    default: vi.fn(), // mock the React component; keep pure helper exports
  };
});

vi.mock('../utils/buildTree.js', () => ({
  buildTree: vi
    .fn()
    .mockResolvedValue({ name: 'mock', type: 'dir', children: [] }),
}));

// ─────────────────────────────────────────────
// Shared mock tree
// ─────────────────────────────────────────────

const MOCK: FileNode = {
  name: 'my-repo',
  type: 'dir',
  children: [
    {
      name: 'src',
      type: 'dir',
      children: [
        { name: 'index.ts', type: 'file', size: '1.2kb', lang: 'ts' },
        { name: 'utils.ts', type: 'file', size: '0.8kb', lang: 'ts' },
      ],
    },
    {
      name: 'docs',
      type: 'dir',
      children: [{ name: 'guide.md', type: 'file', size: '3.1kb', lang: 'md' }],
    },
    { name: 'README.md', type: 'file', size: '0.8kb', lang: 'md' },
    { name: 'package.json', type: 'file', size: '0.5kb', lang: 'json' },
  ],
};

// ─────────────────────────────────────────────
// flattenTree
// ─────────────────────────────────────────────

describe('flattenTree', () => {
  it('includes root node at depth 0', () => {
    const nodes = flattenTree(MOCK);
    expect(nodes[0].name).toBe('my-repo');
    expect(nodes[0].depth).toBe(0);
  });

  it('assigns correct depth to nested nodes', () => {
    const nodes = flattenTree(MOCK);
    const src = nodes.find((n) => n.name === 'src');
    const indexTs = nodes.find((n) => n.name === 'index.ts');
    expect(src?.depth).toBe(1);
    expect(indexTs?.depth).toBe(2);
  });

  it('builds slash-separated paths', () => {
    const nodes = flattenTree(MOCK);
    const indexTs = nodes.find((n) => n.name === 'index.ts');
    expect(indexTs?.path).toBe('my-repo/src/index.ts');
  });

  it('sets id as encodeURIComponent of path', () => {
    const nodes = flattenTree(MOCK);
    const indexTs = nodes.find((n) => n.name === 'index.ts');
    expect(indexTs?.id).toBe(encodeURIComponent('my-repo/src/index.ts'));
  });

  it('returns every node in the tree', () => {
    const nodes = flattenTree(MOCK);
    // root + src + index.ts + utils.ts + docs + guide.md + README.md + package.json
    expect(nodes.length).toBe(8);
  });

  it('preserves lang and size on file nodes', () => {
    const nodes = flattenTree(MOCK);
    const readme = nodes.find((n) => n.name === 'README.md');
    expect(readme?.lang).toBe('md');
    expect(readme?.size).toBe('0.8kb');
  });
});

// ─────────────────────────────────────────────
// countNodes
// ─────────────────────────────────────────────

describe('countNodes', () => {
  it('counts a file node as 1 file 0 dirs', () => {
    const file: FileNode = { name: 'a.ts', type: 'file' };
    expect(countNodes(file)).toEqual({ files: 1, dirs: 0 });
  });

  it('counts the root dir itself as 1 dir', () => {
    const dir: FileNode = { name: 'd', type: 'dir', children: [] };
    expect(countNodes(dir).dirs).toBe(1);
  });

  it('counts all files and dirs recursively', () => {
    const result = countNodes(MOCK);
    // dirs:  my-repo + src + docs = 3
    // files: index.ts + utils.ts + guide.md + README.md + package.json = 5
    expect(result.dirs).toBe(3);
    expect(result.files).toBe(5);
  });

  it('handles a flat dir with only files', () => {
    const flat: FileNode = {
      name: 'flat',
      type: 'dir',
      children: [
        { name: 'a.ts', type: 'file' },
        { name: 'b.ts', type: 'file' },
      ],
    };
    expect(countNodes(flat)).toEqual({ files: 2, dirs: 1 });
  });
});

// ─────────────────────────────────────────────
// visualizeCommand shape
// Imported once at module level — no per-test dynamic import
// ─────────────────────────────────────────────

import { visualizeCommand } from '../commands/visualize.js';

describe('visualizeCommand', () => {
  it('has correct command string', () => {
    expect(visualizeCommand.command).toBe('visualize [path]');
  });

  it('has correct aliases', () => {
    expect(visualizeCommand.aliases).toContain('viz');
    expect(visualizeCommand.aliases).toContain('tree');
  });

  it('has a non-empty describe string', () => {
    expect(typeof visualizeCommand.describe).toBe('string');
    expect((visualizeCommand.describe as string).length).toBeGreaterThan(0);
  });

  it('has builder and handler functions', () => {
    expect(typeof visualizeCommand.builder).toBe('function');
    expect(typeof visualizeCommand.handler).toBe('function');
  });

  it('registers path positional in builder', () => {
    const mockYargs = {
      middleware: vi.fn().mockReturnThis(),
      positional: vi.fn().mockReturnThis(),
      version: vi.fn().mockReturnThis(),
    };
    (visualizeCommand.builder as (y: unknown) => unknown)(mockYargs);
    expect(mockYargs.positional).toHaveBeenCalledWith(
      'path',
      expect.objectContaining({ type: 'string' }),
    );
  });
});

// ─────────────────────────────────────────────
// visualizeProvider
// ─────────────────────────────────────────────

import { visualizeProvider } from './hooks/shell-completions/visualizeProvider.js';

describe('visualizeProvider', () => {
  it('has command set to "visualize"', () => {
    expect(visualizeProvider.command).toBe('visualize');
  });

  it('returns suggestions with label and value fields', async () => {
    const result = await visualizeProvider.getCompletions([], 0, process.cwd());
    expect(Array.isArray(result.suggestions)).toBe(true);
    if (result.suggestions.length > 0) {
      expect(result.suggestions[0]).toHaveProperty('label');
      expect(result.suggestions[0]).toHaveProperty('value');
    }
  });

  it('returns empty suggestions for a non-existent path', async () => {
    const result = await visualizeProvider.getCompletions(
      ['/this/path/does/not/exist'],
      0,
      '/this/path/does/not/exist',
    );
    expect(result.suggestions).toEqual([]);
  });

  it('respects AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await visualizeProvider.getCompletions(
      [],
      0,
      process.cwd(),
      controller.signal,
    );
    expect(result.suggestions).toEqual([]);
  });
});
