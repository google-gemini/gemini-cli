/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { resolveAtCommandPath } from './atCommandUtils.js';
import { type Config } from '@google/gemini-cli-core';

vi.mock('node:fs/promises');

describe('atCommandUtils', () => {
  let mockConfig: Record<string, unknown>;
  let mockWorkspaceContext: Record<string, unknown>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockWorkspaceContext = {
      getDirectories: vi.fn().mockReturnValue(['/mock/root']),
      isPathReadable: vi.fn().mockReturnValue(true),
    };

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue('/mock/root'),
      getWorkspaceContext: vi.fn().mockReturnValue(mockWorkspaceContext),
      validatePathAccess: vi.fn().mockReturnValue(null),
    };
  });

  it('should resolve a valid path', async () => {
    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    const result = await resolveAtCommandPath(
      'file.ts',
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(
        path.resolve('/mock/root', 'file.ts'),
      );
      expect(result.resolved.relativePath).toBe('file.ts');
    }
  });

  it('should resolve an absolute path', async () => {
    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    const absolutePath = path.resolve('/mock/root', 'src/index.ts');
    const result = await resolveAtCommandPath(
      absolutePath,
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(absolutePath);
      expect(result.resolved.relativePath).toBe('src/index.ts');
    }
  });

  it('should handle multiple directories in workspace context', async () => {
    (mockWorkspaceContext['getDirectories'] as Mock).mockReturnValue([
      '/dir1',
      '/dir2',
    ]);
    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };

    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p === path.resolve('/dir2', 'file.txt')) {
        return mockStats as unknown as Stats;
      }
      throw new Error('ENOENT');
    });

    const result = await resolveAtCommandPath(
      'file.txt',
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(
        path.resolve('/dir2', 'file.txt'),
      );
      expect(result.resolved.relativePath).toBe('file.txt');
    }
  });

  it('should return invalid for invalid path (too long)', async () => {
    const longPath = 'a'.repeat(5000);
    const result = await resolveAtCommandPath(
      longPath,
      mockConfig as unknown as Config,
    );
    expect(result.status).toBe('invalid');
  });

  it('should return invalid for path with log markers', async () => {
    const onDebug = vi.fn();
    const result = await resolveAtCommandPath(
      'FAIL tests/my.test.ts',
      mockConfig as unknown as Config,
      onDebug,
    );
    expect(result.status).toBe('invalid');
    expect(onDebug).toHaveBeenCalledWith(
      expect.stringContaining('Skipping invalid path'),
    );
  });

  it('should return not_found if path does not exist in any workspace directory', async () => {
    vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT'));

    const result = await resolveAtCommandPath(
      'nonexistent.ts',
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('not_found');
  });

  it('should resolve directory paths correctly', async () => {
    const mockStats = {
      isDirectory: () => true,
      isFile: () => false,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    const result = await resolveAtCommandPath(
      'src',
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.stats.isDirectory()).toBe(true);
    }
  });

  it('should respect validatePathAccess for paths within root', async () => {
    (mockConfig['validatePathAccess'] as Mock).mockReturnValue(
      'Unauthorized access',
    );
    // Mock getTargetDir to match the resolved path so it's considered "within root"
    (mockConfig['getTargetDir'] as Mock).mockReturnValue('/mock/root');

    const result = await resolveAtCommandPath(
      'secret.txt',
      mockConfig as unknown as Config,
    );
    expect(result.status).toBe('unauthorized');
  });

  it('should return unauthorized for paths outside root', async () => {
    (mockConfig['validatePathAccess'] as Mock).mockReturnValue(
      'Outside workspace',
    );
    (mockConfig['getTargetDir'] as Mock).mockReturnValue('/mock/workspace');

    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    // Path resolve will use /mock/root as base from mockWorkspaceContext
    const result = await resolveAtCommandPath(
      'outside.txt',
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('unauthorized');
    if (result.status === 'unauthorized') {
      expect(result.absolutePath).toBe(
        path.resolve('/mock/root', 'outside.txt'),
      );
    }
  });
});
