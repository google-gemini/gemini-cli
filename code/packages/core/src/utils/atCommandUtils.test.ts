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
import { type Config } from '../config/config.js';

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
      expect(result.resolved.relativePath).toBe(path.join('src', 'index.ts'));
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

  it('should return invalid for path with log markers (and no valid subpath)', async () => {
    const onDebug = vi.fn();
    const result = await resolveAtCommandPath(
      'FAIL AssertionError: expected true to be false',
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

  it('should not treat paths with shared prefixes as subpaths if not actually inside', async () => {
    // /mock/root-backup/file.txt starts with /mock/root but is not inside it.
    const dir = '/mock/root';
    const otherPath = '/mock/root-backup/file.txt';

    (mockWorkspaceContext['getDirectories'] as Mock).mockReturnValue([dir]);
    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    const result = await resolveAtCommandPath(
      otherPath,
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(otherPath);
      // It should NOT be relative to /mock/root because it's not actually inside it.
      // path.relative('/mock/root', '/mock/root-backup/file.txt') -> '../root-backup/file.txt'
      // Our fix should prevent this from being used as a relative path.
      expect(result.resolved.relativePath).toBe(otherPath);
    }
  });

  it('should resolve paths in deeply nested workspace directories', async () => {
    const dir = path.join('/mock', 'root', 'nested', 'project');
    const relFile = path.join('src', 'index.ts');
    const absFile = path.join(dir, relFile);

    (mockWorkspaceContext['getDirectories'] as Mock).mockReturnValue([dir]);
    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockResolvedValue(mockStats as unknown as Stats);

    const result = await resolveAtCommandPath(
      absFile,
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(absFile);
      expect(result.resolved.relativePath).toBe(relFile);
    }
  });

  it('should extract and resolve a buried path from a log fragment', async () => {
    const buriedFile = 'src/utils/math.ts';
    const logFragment = `FAIL ${buriedFile}:42:1 (AssertionError)`;

    const mockStats = {
      isDirectory: () => false,
      isFile: () => true,
    };
    vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
      if (p === path.resolve('/mock/root', buriedFile)) {
        return mockStats as unknown as Stats;
      }
      throw new Error('ENOENT');
    });

    const result = await resolveAtCommandPath(
      logFragment,
      mockConfig as unknown as Config,
    );

    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.resolved.absolutePath).toBe(
        path.resolve('/mock/root', buriedFile),
      );
      expect(result.resolved.relativePath).toBe(buriedFile);
    }
  });

  describe('Best-Effort Path Extraction (tryExtractPath)', () => {
    const mockFile = 'src/index.ts';
    const absMockFile = path.resolve('/mock/root', mockFile);
    const mockStats = { isDirectory: () => false, isFile: () => true };

    beforeEach(() => {
      vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
        if (p === absMockFile) return mockStats as unknown as Stats;
        throw new Error('ENOENT');
      });
    });

    it('should extract path from "AssertionError: ..." format', async () => {
      const result = await resolveAtCommandPath(
        `AssertionError: expected something but got something else at ${mockFile}:10:5`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.absolutePath).toBe(absMockFile);
      }
    });

    it('should extract path wrapped in parentheses', async () => {
      const result = await resolveAtCommandPath(
        `FAIL (${mockFile})`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.absolutePath).toBe(absMockFile);
      }
    });

    it('should extract path wrapped in square brackets', async () => {
      const result = await resolveAtCommandPath(
        `FAIL [${mockFile}]`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.absolutePath).toBe(absMockFile);
      }
    });

    it('should extract path from "✓" pass marker', async () => {
      const result = await resolveAtCommandPath(
        `✓ ${mockFile}`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
    });

    it('should extract path from "×" fail marker', async () => {
      const result = await resolveAtCommandPath(
        `× ${mockFile}`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
    });

    it('should handle multiple trailing punctuation marks like file.txt...', async () => {
      const result = await resolveAtCommandPath(
        `FAIL ${mockFile}...`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.absolutePath).toBe(absMockFile);
      }
    });

    it('should handle nested wrappers like ("path/to/file.ts")', async () => {
      const result = await resolveAtCommandPath(
        `FAIL ("${mockFile}")`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.absolutePath).toBe(absMockFile);
      }
    });

    it('should NOT strip traversal (..), but let central validation handle it', async () => {
      const traversalPath = 'src/../../etc/passwd';
      const absPath = path.resolve('/mock/root', traversalPath);

      (mockConfig['validatePathAccess'] as Mock).mockImplementation((p) => {
        if (p === absPath) return 'Outside workspace';
        return null;
      });

      const result = await resolveAtCommandPath(
        `FAIL ${traversalPath}`,
        mockConfig as unknown as Config,
      );

      // It should NOT be stripped. It should resolve to the absolute path and fail authorization.
      expect(result.status).toBe('unauthorized');
      if (result.status === 'unauthorized') {
        expect(result.absolutePath).toBe(absPath);
      }
    });

    it('should reject paths with null bytes via validatePath', async () => {
      const nullBytePath = 'src/index.ts\0.exe';
      const result = await resolveAtCommandPath(
        `FAIL ${nullBytePath}`,
        mockConfig as unknown as Config,
      );
      // validatePath rejects strings with null bytes
      expect(result.status).toBe('invalid');
    });

    it('should handle paths with slashes and extensions correctly', async () => {
      const complexPath = 'packages/core/src/utils/deep.test.ts';
      const absComplexPath = path.resolve('/mock/root', complexPath);
      vi.mocked(fsPromises.stat).mockImplementation(async (p) => {
        if (p === absComplexPath) return mockStats as unknown as Stats;
        throw new Error('ENOENT');
      });

      const result = await resolveAtCommandPath(
        `FAIL ${complexPath}:123`,
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('resolved');
      if (result.status === 'resolved') {
        expect(result.resolved.relativePath).toBe(complexPath);
      }
    });

    it('should fail gracefully if no valid path can be extracted', async () => {
      const result = await resolveAtCommandPath(
        'FAIL some random text with no slashes or dots',
        mockConfig as unknown as Config,
      );
      expect(result.status).toBe('invalid');
    });

    it('should return unauthorized if the extracted path is not authorized', async () => {
      const secretFile = '/etc/passwd';
      (mockConfig['validatePathAccess'] as Mock).mockImplementation((p) =>
        p === secretFile ? 'Unauthorized' : null,
      );
      vi.mocked(fsPromises.stat).mockResolvedValue(
        mockStats as unknown as Stats,
      );

      const result = await resolveAtCommandPath(
        `FAIL ${secretFile}`,
        mockConfig as unknown as Config,
      );
      // It should try to resolve /etc/passwd, identify it as unauthorized, and return that status.
      expect(result.status).toBe('unauthorized');
    });
  });

  it('should include reason in debug message for unauthorized paths', async () => {
    const onDebug = vi.fn();
    (mockConfig['validatePathAccess'] as Mock).mockReturnValue(
      'FORBIDDEN_ZONE',
    );

    await resolveAtCommandPath(
      'secret.txt',
      mockConfig as unknown as Config,
      onDebug,
    );

    expect(onDebug).toHaveBeenCalledWith(
      expect.stringContaining('Reason: FORBIDDEN_ZONE'),
    );
  });
});
