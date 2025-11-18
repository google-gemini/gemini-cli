/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isGitRepository, findGitRoot } from './gitUtils.js';

vi.mock('node:fs');
vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof path>('node:path');
  return {
    ...actual,
    resolve: vi.fn((p: string) => p),
    join: vi.fn((...paths: string[]) => paths.join('/')),
    dirname: vi.fn((p: string) => {
      const parts = p.split('/').filter((part) => part);
      if (parts.length === 0) return '/';
      parts.pop();
      return '/' + parts.join('/');
    }),
  };
});

describe('gitUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isGitRepository', () => {
    it('should return true when .git exists in directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = isGitRepository('/home/user/project');

      expect(result).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith('/home/user/project/.git');
    });

    it('should return true when .git exists in parent directory', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // /home/user/project/subdir/.git
        .mockReturnValueOnce(true); // /home/user/project/.git

      const result = isGitRepository('/home/user/project/subdir');

      expect(result).toBe(true);
    });

    it('should return false when no .git found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = isGitRepository('/home/user/project');

      expect(result).toBe(false);
    });

    it('should check parent directories up to root', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      isGitRepository('/home/user/project/deep/nested');

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should stop at root directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.dirname).mockImplementation((p) => {
        if (p === '/') return '/';
        const parts = p.split('/').filter((part) => part);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
      });

      const result = isGitRepository('/home');

      expect(result).toBe(false);
    });

    it('should handle filesystem errors', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = isGitRepository('/restricted');

      expect(result).toBe(false);
    });

    it('should resolve relative paths', () => {
      vi.mocked(path.resolve).mockReturnValue('/absolute/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      isGitRepository('relative/path');

      expect(path.resolve).toHaveBeenCalledWith('relative/path');
    });

    it('should work with worktree .git files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = isGitRepository('/worktree/path');

      expect(result).toBe(true);
    });

    it('should handle empty string path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = isGitRepository('');

      expect(result).toBe(false);
    });

    it('should handle root directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.dirname).mockReturnValue('/');

      const result = isGitRepository('/');

      expect(result).toBe(false);
    });
  });

  describe('findGitRoot', () => {
    it('should return directory when .git exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('/home/user/project');

      expect(result).toBe('/home/user/project');
    });

    it('should return parent directory when .git exists there', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // /home/user/project/subdir/.git
        .mockReturnValueOnce(true); // /home/user/project/.git

      const result = findGitRoot('/home/user/project/subdir');

      expect(result).toBe('/home/user/project');
    });

    it('should return null when no .git found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = findGitRoot('/home/user/project');

      expect(result).toBeNull();
    });

    it('should check parent directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      findGitRoot('/home/user/project/deep/nested');

      expect(fs.existsSync).toHaveBeenCalled();
    });

    it('should stop at root directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.dirname).mockImplementation((p) => {
        if (p === '/') return '/';
        const parts = p.split('/').filter((part) => part);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
      });

      const result = findGitRoot('/home');

      expect(result).toBeNull();
    });

    it('should handle filesystem errors', () => {
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = findGitRoot('/restricted');

      expect(result).toBeNull();
    });

    it('should resolve relative paths', () => {
      vi.mocked(path.resolve).mockReturnValue('/absolute/path');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('relative/path');

      expect(result).toBe('/absolute/path');
    });

    it('should return immediate directory for git root', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('/repo');

      expect(result).toBe('/repo');
    });

    it('should traverse up multiple levels', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false) // /a/b/c/d/.git
        .mockReturnValueOnce(false) // /a/b/c/.git
        .mockReturnValueOnce(false) // /a/b/.git
        .mockReturnValueOnce(true); // /a/.git

      const result = findGitRoot('/a/b/c/d');

      expect(result).toBe('/a');
    });

    it('should handle empty string path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = findGitRoot('');

      expect(result).toBeNull();
    });

    it('should handle root directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.dirname).mockReturnValue('/');

      const result = findGitRoot('/');

      expect(result).toBeNull();
    });
  });

  describe('isGitRepository and findGitRoot consistency', () => {
    it('should both return truthy for same git repo', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const isRepo = isGitRepository('/repo');
      const root = findGitRoot('/repo');

      expect(isRepo).toBe(true);
      expect(root).not.toBeNull();
    });

    it('should both return falsy for non-repo', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const isRepo = isGitRepository('/not-a-repo');
      const root = findGitRoot('/not-a-repo');

      expect(isRepo).toBe(false);
      expect(root).toBeNull();
    });

    it('should find same root for nested paths', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      isGitRepository('/repo/subdir');
      const root = findGitRoot('/repo/subdir');

      expect(root).toBe('/repo');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with trailing slashes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('/home/user/project/');

      expect(result).toBeTruthy();
    });

    it('should handle paths with multiple slashes', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = isGitRepository('/home//user///project');

      expect(result).toBe(true);
    });

    it('should handle Windows-style paths', () => {
      vi.mocked(path.join).mockImplementation((...parts) => parts.join('\\'));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = isGitRepository('C:\\Users\\user\\project');

      expect(result).toBe(true);
    });

    it('should handle symlinked directories', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('/symlink/to/repo');

      expect(result).toBe('/symlink/to/repo');
    });
  });

  describe('error scenarios', () => {
    it('should return false on EACCES error', () => {
      const error = new Error('Permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw error;
      });

      const result = isGitRepository('/restricted');

      expect(result).toBe(false);
    });

    it('should return null on ENOENT error', () => {
      const error = new Error('No such file');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      vi.mocked(fs.existsSync).mockImplementation(() => {
        throw error;
      });

      const result = findGitRoot('/nonexistent');

      expect(result).toBeNull();
    });

    it('should handle errors in path operations', () => {
      vi.mocked(path.resolve).mockImplementation(() => {
        throw new Error('Path error');
      });

      const result = isGitRepository('/path');

      expect(result).toBe(false);
    });
  });

  describe('path.join usage', () => {
    it('should join directory with .git', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      isGitRepository('/home/user/project');

      expect(path.join).toHaveBeenCalledWith('/home/user/project', '.git');
    });

    it('should use correct path separator', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      findGitRoot('/repo');

      expect(path.join).toHaveBeenCalled();
    });
  });

  describe('directory traversal', () => {
    it('should traverse exactly to root', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      let callCount = 0;
      vi.mocked(path.dirname).mockImplementation((p) => {
        callCount++;
        if (p === '/' || callCount > 10) return p; // Safety limit
        const parts = p.split('/').filter((part) => part);
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
      });

      isGitRepository('/a/b/c');

      expect(callCount).toBeGreaterThan(0);
    });

    it('should not traverse beyond root', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(path.dirname).mockReturnValue('/');

      findGitRoot('/single');

      // Should check /single/.git and /. git, then stop
      expect(fs.existsSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('return values', () => {
    it('isGitRepository should return boolean', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = isGitRepository('/path');

      expect(typeof result).toBe('boolean');
    });

    it('findGitRoot should return string or null', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = findGitRoot('/path');

      expect(typeof result === 'string' || result === null).toBe(true);
    });

    it('findGitRoot should return absolute path', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(path.resolve).mockReturnValue('/absolute/path');

      const result = findGitRoot('relative');

      expect(result).toBe('/absolute/path');
    });
  });
});
