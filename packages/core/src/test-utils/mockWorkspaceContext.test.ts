/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createMockWorkspaceContext } from './mockWorkspaceContext.js';

describe('createMockWorkspaceContext', () => {
  describe('basic functionality', () => {
    it('should create a mock workspace context with root directory', () => {
      const rootDir = '/home/user/project';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(mockContext).toBeDefined();
      expect(mockContext.getDirectories()).toContain(rootDir);
    });

    it('should include root directory in directories list', () => {
      const rootDir = '/workspace/app';
      const mockContext = createMockWorkspaceContext(rootDir);

      const directories = mockContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(directories[0]).toBe(rootDir);
    });

    it('should create mock with additional directories', () => {
      const rootDir = '/home/user/project';
      const additionalDirs = ['/home/user/lib', '/home/user/tests'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      const directories = mockContext.getDirectories();
      expect(directories).toHaveLength(3);
      expect(directories).toContain(rootDir);
      expect(directories).toContain('/home/user/lib');
      expect(directories).toContain('/home/user/tests');
    });

    it('should handle empty additional directories array', () => {
      const rootDir = '/project';
      const mockContext = createMockWorkspaceContext(rootDir, []);

      const directories = mockContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(directories[0]).toBe(rootDir);
    });

    it('should work without additional directories parameter', () => {
      const rootDir = '/home/workspace';
      const mockContext = createMockWorkspaceContext(rootDir);

      const directories = mockContext.getDirectories();
      expect(directories).toHaveLength(1);
      expect(directories[0]).toBe(rootDir);
    });
  });

  describe('mock methods', () => {
    it('should have addDirectory method as mock function', () => {
      const mockContext = createMockWorkspaceContext('/root');

      expect(mockContext.addDirectory).toBeDefined();
      expect(vi.isMockFunction(mockContext.addDirectory)).toBe(true);
    });

    it('should have getDirectories method as mock function', () => {
      const mockContext = createMockWorkspaceContext('/root');

      expect(mockContext.getDirectories).toBeDefined();
      expect(vi.isMockFunction(mockContext.getDirectories)).toBe(true);
    });

    it('should have isPathWithinWorkspace method as mock function', () => {
      const mockContext = createMockWorkspaceContext('/root');

      expect(mockContext.isPathWithinWorkspace).toBeDefined();
      expect(vi.isMockFunction(mockContext.isPathWithinWorkspace)).toBe(true);
    });

    it('should allow calling addDirectory', () => {
      const mockContext = createMockWorkspaceContext('/root');

      expect(() => mockContext.addDirectory('/new-dir')).not.toThrow();
      expect(mockContext.addDirectory).toHaveBeenCalledWith('/new-dir');
    });

    it('should return directories from getDirectories', () => {
      const rootDir = '/workspace';
      const additionalDirs = ['/lib'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      const result = mockContext.getDirectories();

      expect(result).toEqual(['/workspace', '/lib']);
    });
  });

  describe('isPathWithinWorkspace', () => {
    it('should return true for path within root directory', () => {
      const rootDir = '/home/user/project';
      const mockContext = createMockWorkspaceContext(rootDir);

      const result = mockContext.isPathWithinWorkspace(
        '/home/user/project/src/index.ts',
      );

      expect(result).toBe(true);
    });

    it('should return false for path outside root directory', () => {
      const rootDir = '/home/user/project';
      const mockContext = createMockWorkspaceContext(rootDir);

      const result = mockContext.isPathWithinWorkspace(
        '/home/user/other/file.ts',
      );

      expect(result).toBe(false);
    });

    it('should return true for path within additional directory', () => {
      const rootDir = '/home/user/project';
      const additionalDirs = ['/home/user/lib'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      const result = mockContext.isPathWithinWorkspace(
        '/home/user/lib/utils.ts',
      );

      expect(result).toBe(true);
    });

    it('should check all directories', () => {
      const rootDir = '/workspace';
      const additionalDirs = ['/lib', '/tests'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      expect(mockContext.isPathWithinWorkspace('/workspace/app.ts')).toBe(true);
      expect(mockContext.isPathWithinWorkspace('/lib/util.ts')).toBe(true);
      expect(mockContext.isPathWithinWorkspace('/tests/test.ts')).toBe(true);
      expect(mockContext.isPathWithinWorkspace('/other/file.ts')).toBe(false);
    });

    it('should use startsWith for path matching', () => {
      const rootDir = '/app';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(mockContext.isPathWithinWorkspace('/app/src')).toBe(true);
      expect(mockContext.isPathWithinWorkspace('/app')).toBe(true);
      expect(mockContext.isPathWithinWorkspace('/application')).toBe(false);
    });

    it('should handle exact directory path', () => {
      const rootDir = '/home/project';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(mockContext.isPathWithinWorkspace('/home/project')).toBe(true);
    });

    it('should handle nested paths', () => {
      const rootDir = '/home/user/workspace';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(
        mockContext.isPathWithinWorkspace('/home/user/workspace/a/b/c/file.ts'),
      ).toBe(true);
    });
  });

  describe('directory ordering', () => {
    it('should place root directory first', () => {
      const rootDir = '/root';
      const additionalDirs = ['/a', '/b', '/c'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      const directories = mockContext.getDirectories();
      expect(directories[0]).toBe(rootDir);
    });

    it('should maintain order of additional directories', () => {
      const rootDir = '/root';
      const additionalDirs = ['/first', '/second', '/third'];
      const mockContext = createMockWorkspaceContext(rootDir, additionalDirs);

      const directories = mockContext.getDirectories();
      expect(directories[1]).toBe('/first');
      expect(directories[2]).toBe('/second');
      expect(directories[3]).toBe('/third');
    });
  });

  describe('edge cases', () => {
    it('should handle root directory as /', () => {
      const mockContext = createMockWorkspaceContext('/');

      expect(mockContext.getDirectories()).toContain('/');
      expect(mockContext.isPathWithinWorkspace('/any/path')).toBe(true);
    });

    it('should handle relative-looking paths', () => {
      const rootDir = 'relative/path';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(mockContext.getDirectories()).toContain('relative/path');
      expect(mockContext.isPathWithinWorkspace('relative/path/file.ts')).toBe(
        true,
      );
    });

    it('should handle Windows-style paths', () => {
      const rootDir = 'C:\\Users\\User\\Project';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(mockContext.getDirectories()).toContain(
        'C:\\Users\\User\\Project',
      );
      expect(
        mockContext.isPathWithinWorkspace('C:\\Users\\User\\Project\\file.ts'),
      ).toBe(true);
    });

    it('should handle empty string root directory', () => {
      const mockContext = createMockWorkspaceContext('');

      expect(mockContext.getDirectories()).toContain('');
      // Empty string startsWith check will match everything
      expect(mockContext.isPathWithinWorkspace('anything')).toBe(true);
    });

    it('should handle special characters in path', () => {
      const rootDir = '/home/user/project (copy)';
      const mockContext = createMockWorkspaceContext(rootDir);

      expect(
        mockContext.isPathWithinWorkspace('/home/user/project (copy)/file.ts'),
      ).toBe(true);
    });
  });

  describe('mock function behavior', () => {
    it('should track calls to addDirectory', () => {
      const mockContext = createMockWorkspaceContext('/root');

      mockContext.addDirectory('/new');
      mockContext.addDirectory('/another');

      expect(mockContext.addDirectory).toHaveBeenCalledTimes(2);
      expect(mockContext.addDirectory).toHaveBeenNthCalledWith(1, '/new');
      expect(mockContext.addDirectory).toHaveBeenNthCalledWith(2, '/another');
    });

    it('should track calls to getDirectories', () => {
      const mockContext = createMockWorkspaceContext('/root');

      mockContext.getDirectories();
      mockContext.getDirectories();

      expect(mockContext.getDirectories).toHaveBeenCalledTimes(2);
    });

    it('should track calls to isPathWithinWorkspace', () => {
      const mockContext = createMockWorkspaceContext('/root');

      mockContext.isPathWithinWorkspace('/root/file.ts');
      mockContext.isPathWithinWorkspace('/other/file.ts');

      expect(mockContext.isPathWithinWorkspace).toHaveBeenCalledTimes(2);
      expect(mockContext.isPathWithinWorkspace).toHaveBeenNthCalledWith(
        1,
        '/root/file.ts',
      );
      expect(mockContext.isPathWithinWorkspace).toHaveBeenNthCalledWith(
        2,
        '/other/file.ts',
      );
    });
  });

  describe('independence of instances', () => {
    it('should create independent mock instances', () => {
      const mock1 = createMockWorkspaceContext('/root1');
      const mock2 = createMockWorkspaceContext('/root2');

      expect(mock1).not.toBe(mock2);
      expect(mock1.getDirectories()).not.toBe(mock2.getDirectories());
    });

    it('should not share mock state between instances', () => {
      const mock1 = createMockWorkspaceContext('/root1');
      const mock2 = createMockWorkspaceContext('/root2');

      mock1.addDirectory('/dir1');

      expect(mock1.addDirectory).toHaveBeenCalledTimes(1);
      expect(mock2.addDirectory).toHaveBeenCalledTimes(0);
    });

    it('should have different directories in different instances', () => {
      const mock1 = createMockWorkspaceContext('/root1', ['/lib1']);
      const mock2 = createMockWorkspaceContext('/root2', ['/lib2']);

      expect(mock1.getDirectories()).toEqual(['/root1', '/lib1']);
      expect(mock2.getDirectories()).toEqual(['/root2', '/lib2']);
    });
  });
});
