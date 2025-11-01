/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ContextManager } from './contextManager.js';
import { coreEvents } from '../utils/events.js';

vi.mock('../tools/memoryTool.js', () => ({
  getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'),
}));

vi.mock('../utils/memoryImportProcessor.js', () => ({
  processImports: vi.fn(async (content) => ({
    content,
    importTree: { path: 'test' },
  })),
}));

vi.mock('../utils/events.js', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
}));

describe('ContextManager', () => {
  let testRootDir: string;
  let projectRoot: string;
  let contextManager: ContextManager;

  beforeEach(async () => {
    vi.resetAllMocks();
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'context-manager-test-'),
    );
    projectRoot = path.join(testRootDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });

    contextManager = new ContextManager(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should manage loaded states correctly', () => {
    const file = path.join(projectRoot, 'src/file.ts');
    expect(contextManager.isLoaded(file)).toBe(false);

    contextManager.markAsLoaded(file);
    expect(contextManager.isLoaded(file)).toBe(true);

    contextManager.unload(file);
    expect(contextManager.isLoaded(file)).toBe(false);

    contextManager.markAsLoaded(file);
    contextManager.reset();
    expect(contextManager.isLoaded(file)).toBe(false);
  });

  it('should discover context in the same directory', async () => {
    const accessedPath = path.join(projectRoot, 'src');
    await fs.mkdir(accessedPath, { recursive: true });
    const contextFile = path.join(accessedPath, 'GEMINI.md');
    await fs.writeFile(contextFile, 'Context content', 'utf8');

    const result = await contextManager.discoverContext(accessedPath);

    expect(result).toContain('Context content');
    expect(result).toContain(path.join('src', 'GEMINI.md'));
    expect(contextManager.isLoaded(contextFile)).toBe(true);
  });

  it('should start from parent directory if accessed path is a file', async () => {
    const srcDir = path.join(projectRoot, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const accessedFile = path.join(srcDir, 'main.ts');
    await fs.writeFile(accessedFile, '// some code', 'utf8');

    const contextFile = path.join(srcDir, 'GEMINI.md');
    await fs.writeFile(contextFile, 'Main context', 'utf8');

    await contextManager.discoverContext(accessedFile);

    expect(contextManager.isLoaded(contextFile)).toBe(true);
  });

  it('should traverse upwards to project root', async () => {
    const authDir = path.join(projectRoot, 'src/features/auth');
    await fs.mkdir(authDir, { recursive: true });

    const authContext = path.join(authDir, 'GEMINI.md');
    await fs.writeFile(authContext, 'Auth Context', 'utf8');

    const srcContext = path.join(projectRoot, 'src/GEMINI.md');
    await fs.writeFile(srcContext, 'Src Context', 'utf8');

    const rootContext = path.join(projectRoot, 'GEMINI.md');
    await fs.writeFile(rootContext, 'Root Context', 'utf8');

    const result = await contextManager.discoverContext(authDir);

    expect(result).toContain('Auth Context');
    expect(result).toContain('Src Context');
    expect(result).toContain('Root Context');
    expect(contextManager.isLoaded(authContext)).toBe(true);
    expect(contextManager.isLoaded(srcContext)).toBe(true);
    expect(contextManager.isLoaded(rootContext)).toBe(true);
  });

  it('should stop traversal at project root', async () => {
    const rootContext = path.join(projectRoot, 'GEMINI.md');
    await fs.writeFile(rootContext, 'Root Context', 'utf8');

    // Create a context file OUTSIDE the project root in the testRootDir
    const outsideContext = path.join(testRootDir, 'GEMINI.md');
    await fs.writeFile(outsideContext, 'Outside Context', 'utf8');

    await contextManager.discoverContext(projectRoot);

    expect(contextManager.isLoaded(rootContext)).toBe(true);
    // Should NOT have loaded the one outside
    expect(contextManager.isLoaded(outsideContext)).toBe(false);
  });

  it('should not re-load already loaded context', async () => {
    const accessedPath = path.join(projectRoot, 'src');
    await fs.mkdir(accessedPath, { recursive: true });
    const contextFile = path.join(accessedPath, 'GEMINI.md');
    await fs.writeFile(contextFile, 'Initial content', 'utf8');

    // First load
    const result1 = await contextManager.discoverContext(accessedPath);
    expect(result1).toContain('Initial content');

    // Modify file on disk
    await fs.writeFile(contextFile, 'Modified content', 'utf8');

    // Second load
    const result2 = await contextManager.discoverContext(accessedPath);

    // Should be empty because it's already loaded
    expect(result2).toBe('');
  });

  it('should report read errors via coreEvents', async () => {
    const accessedPath = path.join(projectRoot, 'src');
    await fs.mkdir(accessedPath, { recursive: true });
    const contextFile = path.join(accessedPath, 'GEMINI.md');

    // Create a directory with the same name as the context file to cause a read error (EISDIR)
    await fs.mkdir(contextFile);

    await contextManager.discoverContext(accessedPath);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Failed to read context file'),
      expect.anything(),
    );
  });
});
