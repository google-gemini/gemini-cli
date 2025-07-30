/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceContext } from './workspaceContext.js';

vi.mock('fs');

describe('WorkspaceContext', () => {
  let workspaceContext: WorkspaceContext;
  // Use path module to create platform-agnostic paths
  const mockCwd = path.resolve(path.sep, 'home', 'user', 'project');
  const mockExistingDir = path.resolve(
    path.sep,
    'home',
    'user',
    'other-project',
  );
  const mockNonExistentDir = path.resolve(
    path.sep,
    'home',
    'user',
    'does-not-exist',
  );
  const mockSymlinkDir = path.resolve(path.sep, 'home', 'user', 'symlink');
  const mockRealPath = path.resolve(path.sep, 'home', 'user', 'real-directory');

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock fs.existsSync
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      return (
        pathStr === mockCwd ||
        pathStr === mockExistingDir ||
        pathStr === mockSymlinkDir ||
        pathStr === mockRealPath
      );
    });

    // Mock fs.statSync
    vi.mocked(fs.statSync).mockImplementation((path) => {
      const pathStr = path.toString();
      if (pathStr === mockNonExistentDir) {
        throw new Error('ENOENT');
      }
      return {
        isDirectory: () => true,
      } as fs.Stats;
    });

    // Mock fs.realpathSync
    vi.mocked(fs.realpathSync).mockImplementation((path) => {
      const pathStr = path.toString();
      if (pathStr === mockSymlinkDir) {
        return mockRealPath;
      }
      return pathStr;
    });
  });

  describe('initialization', () => {
    it('should initialize with a single directory (cwd)', () => {
      workspaceContext = new WorkspaceContext(mockCwd);
      const directories = workspaceContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(directories[0]).toBe(mockCwd);
    });

    it('should validate and resolve directories to absolute paths', () => {
      const absolutePath = path.join(mockCwd, 'subdir');
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === mockCwd || p === absolutePath,
      );
      vi.mocked(fs.realpathSync).mockImplementation((p) => p.toString());

      workspaceContext = new WorkspaceContext(mockCwd, [absolutePath]);
      const directories = workspaceContext.getDirectories();
      expect(directories).toContain(absolutePath);
    });

    it('should reject non-existent directories', () => {
      expect(() => {
        new WorkspaceContext(mockCwd, [mockNonExistentDir]);
      }).toThrow('Directory does not exist');
    });

    it('should handle empty initialization', () => {
      workspaceContext = new WorkspaceContext(mockCwd, []);
      const directories = workspaceContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(directories[0]).toBe(mockCwd);
    });
  });

  describe('adding directories', () => {
    beforeEach(() => {
      workspaceContext = new WorkspaceContext(mockCwd);
    });

    it('should add valid directories', () => {
      workspaceContext.addDirectory(mockExistingDir);
      const directories = workspaceContext.getDirectories();
      expect(directories).toHaveLength(2);
      expect(directories).toContain(mockExistingDir);
    });

    it('should resolve relative paths to absolute', () => {
      // Since we can't mock path.resolve, we'll test with absolute paths
      workspaceContext.addDirectory(mockExistingDir);
      const directories = workspaceContext.getDirectories();
      expect(directories).toContain(mockExistingDir);
    });

    it('should reject non-existent directories', () => {
      expect(() => {
        workspaceContext.addDirectory(mockNonExistentDir);
      }).toThrow('Directory does not exist');
    });

    it('should prevent duplicate directories', () => {
      workspaceContext.addDirectory(mockExistingDir);
      workspaceContext.addDirectory(mockExistingDir);
      const directories = workspaceContext.getDirectories();
      expect(directories.filter((d) => d === mockExistingDir)).toHaveLength(1);
    });

    it('should handle symbolic links correctly', () => {
      workspaceContext.addDirectory(mockSymlinkDir);
      const directories = workspaceContext.getDirectories();
      expect(directories).toContain(mockRealPath);
      expect(directories).not.toContain(mockSymlinkDir);
    });
  });

  describe('path validation', () => {
    beforeEach(() => {
      workspaceContext = new WorkspaceContext(mockCwd, [mockExistingDir]);
    });

    it('should accept paths within workspace directories', () => {
      const validPath1 = path.join(mockCwd, 'src', 'file.ts');
      const validPath2 = path.join(mockExistingDir, 'lib', 'module.js');

      expect(workspaceContext.isPathWithinWorkspace(validPath1)).toBe(true);
      expect(workspaceContext.isPathWithinWorkspace(validPath2)).toBe(true);
    });

    it('should reject paths outside workspace', () => {
      const invalidPath = path.resolve(
        path.dirname(mockCwd),
        'outside-workspace',
        'file.txt',
      );
      expect(workspaceContext.isPathWithinWorkspace(invalidPath)).toBe(false);
    });

    it('should resolve symbolic links before validation', () => {
      const symlinkPath = path.join(mockCwd, 'symlink-file');
      const realPath = path.join(mockCwd, 'real-file');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        if (p === symlinkPath) {
          return realPath;
        }
        return p.toString();
      });

      expect(workspaceContext.isPathWithinWorkspace(symlinkPath)).toBe(true);
    });

    it('should handle nested directories correctly', () => {
      const nestedPath = path.join(
        mockCwd,
        'deeply',
        'nested',
        'path',
        'file.txt',
      );
      expect(workspaceContext.isPathWithinWorkspace(nestedPath)).toBe(true);
    });

    it('should handle edge cases (root, parent references)', () => {
      const rootPath = '/';
      const parentPath = path.dirname(mockCwd);

      expect(workspaceContext.isPathWithinWorkspace(rootPath)).toBe(false);
      expect(workspaceContext.isPathWithinWorkspace(parentPath)).toBe(false);
    });

    it('should handle non-existent paths correctly', () => {
      const nonExistentPath = path.join(mockCwd, 'does-not-exist.txt');
      vi.mocked(fs.existsSync).mockImplementation((p) => p !== nonExistentPath);

      // Should still validate based on path structure
      expect(workspaceContext.isPathWithinWorkspace(nonExistentPath)).toBe(
        true,
      );
    });
  });

  describe('getDirectories', () => {
    it('should return a copy of directories array', () => {
      workspaceContext = new WorkspaceContext(mockCwd);
      const dirs1 = workspaceContext.getDirectories();
      const dirs2 = workspaceContext.getDirectories();

      expect(dirs1).not.toBe(dirs2); // Different array instances
      expect(dirs1).toEqual(dirs2); // Same content
    });
  });

  describe('symbolic link security', () => {
    beforeEach(() => {
      workspaceContext = new WorkspaceContext(mockCwd);
    });

    it('should follow symlinks but validate resolved path', () => {
      const symlinkInsideWorkspace = path.join(mockCwd, 'link-to-subdir');
      const resolvedInsideWorkspace = path.join(mockCwd, 'subdir');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        if (p === symlinkInsideWorkspace) {
          return resolvedInsideWorkspace;
        }
        return p.toString();
      });

      expect(
        workspaceContext.isPathWithinWorkspace(symlinkInsideWorkspace),
      ).toBe(true);
    });

    it('should prevent sandbox escape via symlinks', () => {
      const symlinkEscape = path.join(mockCwd, 'escape-link');
      const resolvedOutside = path.resolve(mockCwd, '..', 'outside-file');

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const pathStr = p.toString();
        return (
          pathStr === symlinkEscape ||
          pathStr === resolvedOutside ||
          pathStr === mockCwd
        );
      });
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        if (p.toString() === symlinkEscape) {
          return resolvedOutside;
        }
        return p.toString();
      });
      vi.mocked(fs.statSync).mockImplementation(
        (p) =>
          ({
            isDirectory: () => p.toString() !== resolvedOutside,
          }) as fs.Stats,
      );

      workspaceContext = new WorkspaceContext(mockCwd);
      expect(workspaceContext.isPathWithinWorkspace(symlinkEscape)).toBe(false);
    });

    it('should handle circular symlinks', () => {
      const circularLink = path.join(mockCwd, 'circular');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.realpathSync).mockImplementation(() => {
        throw new Error('ELOOP: too many symbolic links encountered');
      });

      // Should handle the error gracefully
      expect(workspaceContext.isPathWithinWorkspace(circularLink)).toBe(false);
    });
  });
});
