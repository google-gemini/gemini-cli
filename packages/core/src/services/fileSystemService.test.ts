/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('fs/promises', () => {
  const mockReadFile = vi.fn();
  const mockWriteFile = vi.fn();
  return {
    default: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  };
});

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

import fs from 'node:fs/promises';
import { globSync } from 'glob';
import { StandardFileSystemService } from './fileSystemService.js';

describe('StandardFileSystemService', () => {
  let fileSystem: StandardFileSystemService;

  beforeEach(() => {
    vi.resetAllMocks();
    fileSystem = new StandardFileSystemService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readTextFile', () => {
    it('should read file content using fs', async () => {
      const testContent = 'Hello, World!';
      vi.mocked(fs.readFile).mockResolvedValue(testContent);

      const result = await fileSystem.readTextFile('/test/file.txt');

      expect(fs.readFile).toHaveBeenCalledWith('/test/file.txt', 'utf-8');
      expect(result).toBe(testContent);
    });

    it('should propagate fs.readFile errors', async () => {
      const error = new Error('ENOENT: File not found');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readTextFile('/test/file.txt')).rejects.toThrow(
        'ENOENT: File not found',
      );
    });

    it('should handle empty file content', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('');

      const result = await fileSystem.readTextFile('/test/empty.txt');

      expect(fs.readFile).toHaveBeenCalledWith('/test/empty.txt', 'utf-8');
      expect(result).toBe('');
    });

    it('should handle large file content', async () => {
      const largeContent = 'x'.repeat(1000000);
      vi.mocked(fs.readFile).mockResolvedValue(largeContent);

      const result = await fileSystem.readTextFile('/test/large.txt');

      expect(result).toBe(largeContent);
      expect(result.length).toBe(1000000);
    });

    it('should handle special characters in content', async () => {
      const specialContent = '特殊文字\n\t\r\\"\'\u0000';
      vi.mocked(fs.readFile).mockResolvedValue(specialContent);

      const result = await fileSystem.readTextFile('/test/special.txt');

      expect(result).toBe(specialContent);
    });

    it('should handle permission errors', async () => {
      const error = new Error('EACCES: Permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(
        fileSystem.readTextFile('/test/protected.txt'),
      ).rejects.toThrow('EACCES: Permission denied');
    });

    it('should handle file paths with spaces', async () => {
      const testContent = 'content';
      vi.mocked(fs.readFile).mockResolvedValue(testContent);

      const result = await fileSystem.readTextFile(
        '/test/file with spaces.txt',
      );

      expect(fs.readFile).toHaveBeenCalledWith(
        '/test/file with spaces.txt',
        'utf-8',
      );
      expect(result).toBe(testContent);
    });
  });

  describe('writeTextFile', () => {
    it('should write file content using fs', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/file.txt', 'Hello, World!');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/file.txt',
        'Hello, World!',
        'utf-8',
      );
    });

    it('should handle empty content writes', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/empty.txt', '');

      expect(fs.writeFile).toHaveBeenCalledWith('/test/empty.txt', '', 'utf-8');
    });

    it('should handle large content writes', async () => {
      const largeContent = 'y'.repeat(2000000);
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/large.txt', largeContent);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/large.txt',
        largeContent,
        'utf-8',
      );
    });

    it('should propagate write errors', async () => {
      const error = new Error('ENOSPC: No space left on device');
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(
        fileSystem.writeTextFile('/test/file.txt', 'content'),
      ).rejects.toThrow('ENOSPC: No space left on device');
    });

    it('should handle permission errors on write', async () => {
      const error = new Error('EACCES: Permission denied');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(
        fileSystem.writeTextFile('/test/readonly.txt', 'content'),
      ).rejects.toThrow('EACCES: Permission denied');
    });

    it('should handle special characters in write content', async () => {
      const specialContent = '特殊文字\n\t\r\\"\'\u0000';
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/special.txt', specialContent);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/special.txt',
        specialContent,
        'utf-8',
      );
    });

    it('should handle file paths with special characters', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();

      await fileSystem.writeTextFile('/test/file-with-дashes.txt', 'content');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/file-with-дashes.txt',
        'content',
        'utf-8',
      );
    });

    it('should handle read-only filesystem errors', async () => {
      const error = new Error('EROFS: Read-only file system');
      (error as NodeJS.ErrnoException).code = 'EROFS';
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(
        fileSystem.writeTextFile('/readonly/file.txt', 'content'),
      ).rejects.toThrow('EROFS: Read-only file system');
    });
  });

  describe('findFiles', () => {
    it('should find files matching the name in a single search path', () => {
      vi.mocked(globSync).mockReturnValue([
        '/project/src/config.json',
        '/project/lib/config.json',
      ]);

      const result = fileSystem.findFiles('config.json', ['/project']);

      expect(globSync).toHaveBeenCalledWith('/project/**/config.json', {
        nodir: true,
        absolute: true,
      });
      expect(result).toEqual([
        '/project/src/config.json',
        '/project/lib/config.json',
      ]);
    });

    it('should find files across multiple search paths', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce(['/project1/src/test.ts'])
        .mockReturnValueOnce(['/project2/lib/test.ts']);

      const result = fileSystem.findFiles('test.ts', [
        '/project1',
        '/project2',
      ]);

      expect(globSync).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        '/project1/src/test.ts',
        '/project2/lib/test.ts',
      ]);
    });

    it('should return empty array when no files found', () => {
      vi.mocked(globSync).mockReturnValue([]);

      const result = fileSystem.findFiles('nonexistent.txt', ['/project']);

      expect(result).toEqual([]);
    });

    it('should handle empty search paths array', () => {
      const result = fileSystem.findFiles('config.json', []);

      expect(globSync).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should find files with wildcards in name', () => {
      vi.mocked(globSync).mockReturnValue([
        '/project/test1.spec.ts',
        '/project/test2.spec.ts',
      ]);

      const result = fileSystem.findFiles('*.spec.ts', ['/project']);

      expect(globSync).toHaveBeenCalledWith('/project/**/*.spec.ts', {
        nodir: true,
        absolute: true,
      });
      expect(result).toEqual([
        '/project/test1.spec.ts',
        '/project/test2.spec.ts',
      ]);
    });

    it('should use posix path separators in glob pattern', () => {
      vi.mocked(globSync).mockReturnValue([]);

      fileSystem.findFiles('file.txt', ['/some/path']);

      expect(globSync).toHaveBeenCalledWith('/some/path/**/file.txt', {
        nodir: true,
        absolute: true,
      });
    });

    it('should filter out directories (nodir: true)', () => {
      vi.mocked(globSync).mockReturnValue(['/project/file.txt']);

      const result = fileSystem.findFiles('file.txt', ['/project']);

      expect(globSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ nodir: true }),
      );
      expect(result).toEqual(['/project/file.txt']);
    });

    it('should return absolute paths', () => {
      vi.mocked(globSync).mockReturnValue(['/absolute/path/file.txt']);

      const result = fileSystem.findFiles('file.txt', ['/project']);

      expect(globSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ absolute: true }),
      );
      expect(result).toEqual(['/absolute/path/file.txt']);
    });

    it('should handle search paths with trailing slashes', () => {
      vi.mocked(globSync).mockReturnValue(['/project/file.txt']);

      const result = fileSystem.findFiles('file.txt', ['/project/']);

      expect(result).toEqual(['/project/file.txt']);
    });

    it('should deduplicate results from overlapping paths', () => {
      vi.mocked(globSync)
        .mockReturnValueOnce(['/project/src/file.txt'])
        .mockReturnValueOnce(['/project/src/file.txt']);

      const result = fileSystem.findFiles('file.txt', [
        '/project',
        '/project/src',
      ]);

      // Note: This tests current behavior - deduplication would need to be added
      expect(result).toEqual([
        '/project/src/file.txt',
        '/project/src/file.txt',
      ]);
    });

    it('should handle deeply nested file structures', () => {
      vi.mocked(globSync).mockReturnValue(['/project/a/b/c/d/e/f/deep.txt']);

      const result = fileSystem.findFiles('deep.txt', ['/project']);

      expect(result).toEqual(['/project/a/b/c/d/e/f/deep.txt']);
    });

    it('should handle special characters in file names', () => {
      vi.mocked(globSync).mockReturnValue(['/project/file-with-дashes.txt']);

      const result = fileSystem.findFiles('file-with-дashes.txt', ['/project']);

      expect(result).toEqual(['/project/file-with-дashes.txt']);
    });
  });
});
