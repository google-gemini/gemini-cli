/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { resolvePath } from './resolvePath.js';
import { bootstrapWorkspace } from './resolveWorkspace.js';

// Mock dependencies
vi.mock('./resolvePath.js', () => ({
  resolvePath: vi.fn(),
}));

describe('bootstrapWorkspace', () => {
  const mockCwd = '/mock/base/dir';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

    // We don't want to mock path.resolve globally as it might break vitest internals if not careful,
    // but here we can spy on it and provide implementation if needed.
    // However, the plan says "Wrap the result in path.resolve() to ensure it returns an absolute path."
    // So we should expect path.resolve to be called.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve an absolute path correctly', () => {
    const absolutePath = '/user/projects/my-project';
    vi.mocked(resolvePath).mockReturnValue(absolutePath);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    const resolved = bootstrapWorkspace(absolutePath);
    expect(resolved).toBe(absolutePath);
    expect(resolvePath).toHaveBeenCalledWith(absolutePath);
    expect(fs.existsSync).toHaveBeenCalledWith(absolutePath);
  });

  it('should resolve a relative path correctly', () => {
    const relativePath = 'some/directory';
    const absolutePath = path.resolve(mockCwd, relativePath);
    vi.mocked(resolvePath).mockReturnValue(relativePath);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    const resolved = bootstrapWorkspace(relativePath);
    expect(resolved).toBe(absolutePath);
    expect(resolvePath).toHaveBeenCalledWith(relativePath);
    expect(fs.existsSync).toHaveBeenCalledWith(absolutePath);
  });

  it('should throw an error if the workspace path does not exist', () => {
    const nonExistentPath = '/path/not/exist';
    vi.mocked(resolvePath).mockReturnValue(nonExistentPath);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => bootstrapWorkspace(nonExistentPath)).toThrow(
      `Workspace path "${nonExistentPath}" does not exist.`,
    );
  });

  it('should throw an error if the workspace path is not a directory', () => {
    const filePath = '/path/to/file.txt';
    vi.mocked(resolvePath).mockReturnValue(filePath);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => false,
    } as fs.Stats);

    expect(() => bootstrapWorkspace(filePath)).toThrow(
      `Workspace path "${filePath}" is not a directory.`,
    );
  });

  it('should handle paths with ~ prefix via resolvePath', () => {
    const tildePath = '~/my-workspace';
    const expandedPath = '/home/user/my-workspace';
    vi.mocked(resolvePath).mockReturnValue(expandedPath);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    const resolved = bootstrapWorkspace(tildePath);
    expect(resolved).toBe(expandedPath);
    expect(resolvePath).toHaveBeenCalledWith(tildePath);
  });
});
