/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadServerHierarchicalMemory } from './memoryDiscovery.js';
import { FileDiscoveryService } from '../index.js';
import { vol } from 'memfs';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { setGeminiMdFilename } from '../tools/memoryTool.js';

vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual<typeof import('memfs')>('memfs');
  return memfs.fs.promises;
});

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>();
  return {
    ...original,
    homedir: () => '/user/home',
  };
});

describe('loadServerHierarchicalMemory', () => {
  beforeEach(() => {
    vol.reset();
    // Reset to default filename before each test
    setGeminiMdFilename('GEMINI.md');
  });

  it('should return empty memory if no files are found', async () => {
    vol.fromJSON({ '/project/src/main.ts': '' });
    const fileService = new FileDiscoveryService('/project/src');
    const result = await loadServerHierarchicalMemory(
      '/project/src',
      false,
      fileService,
    );
    expect(result).toEqual({
      memoryContent: '',
      fileCount: 0,
      sources: [],
    });
  });

  it('should find GEMINI.md in the current directory', async () => {
    const cwd = '/project/src';
    const geminiMdPath = path.join(cwd, 'GEMINI.md');
    vol.fromJSON({
      [geminiMdPath]: 'CWD content',
    });
    const fileService = new FileDiscoveryService(cwd);
    const result = await loadServerHierarchicalMemory(cwd, false, fileService);
    expect(result.fileCount).toBe(1);
    expect(result.memoryContent).toContain('CWD content');
    expect(result.sources[0].filePath).toBe(geminiMdPath);
  });

  it('should find GEMINI.md by traversing up to project root', async () => {
    const cwd = '/project/src/app';
    const projectRoot = '/project';
    const geminiMdPath = path.join(projectRoot, 'GEMINI.md');
    vol.fromJSON({
      [path.join(projectRoot, '.git')]: '',
      [geminiMdPath]: 'Project root content',
      [path.join(cwd, 'main.ts')]: '',
    });
    const fileService = new FileDiscoveryService(cwd);
    const result = await loadServerHierarchicalMemory(cwd, false, fileService);
    expect(result.fileCount).toBe(1);
    expect(result.memoryContent).toContain('Project root content');
    expect(result.sources[0].filePath).toBe(geminiMdPath);
  });

  it('should find GEMINI.md by traversing down', async () => {
    const cwd = '/project';
    const geminiMdPath = path.join(cwd, 'src/app/GEMINI.md');
    vol.fromJSON({
      [geminiMdPath]: 'Deep content',
      [path.join(cwd, 'main.ts')]: '',
    });
    const fileService = new FileDiscoveryService(cwd);
    const result = await loadServerHierarchicalMemory(cwd, false, fileService);
    expect(result.fileCount).toBe(1);
    expect(result.memoryContent).toContain('Deep content');
    expect(result.sources[0].filePath).toBe(geminiMdPath);
  });

  it('should load global, upward, and downward files in correct order', async () => {
    const cwd = '/project/src';
    const globalPath = '/user/home/.gemini/GEMINI.md';
    const upwardPath = '/project/GEMINI.md';
    const downwardPath = '/project/src/sub/GEMINI.md';

    vol.fromJSON({
      [globalPath]: 'Global content',
      [upwardPath]: 'Upward content',
      [path.join(cwd, 'GEMINI.md')]: 'CWD content',
      [downwardPath]: 'Downward content',
    });

    const fileService = new FileDiscoveryService(cwd);
    const result = await loadServerHierarchicalMemory(cwd, false, fileService);

    expect(result.fileCount).toBe(4);
    const content = result.memoryContent;
    expect(content.indexOf('Global content')).toBeLessThan(
      content.indexOf('Upward content'),
    );
    expect(content.indexOf('Upward content')).toBeLessThan(
      content.indexOf('CWD content'),
    );
    expect(content.indexOf('CWD content')).toBeLessThan(
      content.indexOf('Downward content'),
    );
    expect(result.sources.map((s) => s.filePath)).toEqual([
      globalPath,
      upwardPath,
      path.join(cwd, 'GEMINI.md'),
      downwardPath,
    ]);
  });

  it('should handle imports correctly', async () => {
    const cwd = '/project';
    vol.fromJSON({
      [path.join(cwd, 'GEMINI.md')]: 'Root imports @./feature/GEMINI.md',
      [path.join(cwd, 'feature/GEMINI.md')]: 'Feature content',
    });

    const fileService = new FileDiscoveryService(cwd);
    const result = await loadServerHierarchicalMemory(cwd, false, fileService);

    expect(result.fileCount).toBe(2);
    expect(result.memoryContent).toContain('Root imports Feature content');
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].filePath).toBe(path.join(cwd, 'GEMINI.md'));
    expect(result.sources[0].importTree?.children[0].path).toBe(
      path.join(cwd, 'feature/GEMINI.md'),
    );
  });
});
