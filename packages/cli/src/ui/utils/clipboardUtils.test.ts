/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { SaveClipboardImageResult } from './clipboardUtils.js';
import * as path from 'node:path';

// Mock modules first (hoisted)
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
    readdir: vi.fn(),
    unlink: vi.fn(),
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    exec: vi.fn(),
  };
});

vi.mock('node:os', () => ({
  platform: vi.fn(),
  homedir: () => '/home/test',
}));

// Import the module after setting up mocks
import {
  saveClipboardImage,
  cleanupOldClipboardImages,
} from './clipboardUtils.js';
import * as fs from 'node:fs/promises';
import * as childProcess from 'node:child_process';
import * as os from 'node:os';

// Mock implementations
const mockMkdir = vi.mocked(fs.mkdir);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockStat = vi.mocked(fs.stat);
const mockExec = vi.mocked(childProcess.exec);
const mockPlatform = vi.mocked(os.platform);

// Helper type for exec mock implementation
type ExecMockImplementation = (
  command: string,
  options: unknown,
  callback?: (error: Error | null, stdout: string, stderr: string) => void,
) => childProcess.ChildProcess;

// Mock stats
const mockFileStats = {
  isFile: () => true,
  isDirectory: () => false,
  isSymbolicLink: () => false,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  // Add required properties
  size: 0,
  atime: new Date(),
  mtime: new Date(),
  ctime: new Date(),
  birthtime: new Date(),
  atimeMs: 0,
  mtimeMs: 0,
  ctimeMs: 0,
  birthtimeMs: 0,
  dev: 0,
  ino: 0,
  mode: 0,
  nlink: 0,
  uid: 0,
  gid: 0,
  rdev: 0,
  blksize: 0,
  blocks: 0,
};

describe('clipboardUtils', () => {
  describe('saveClipboardImage', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      // Setup default mocks
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockStat.mockResolvedValue(mockFileStats);

      // Setup default clipboard read mock
      (
        mockExec as unknown as {
          mockImplementation: (impl: ExecMockImplementation) => void;
        }
      ).mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'test clipboard content', '');
        } else if (typeof options === 'function') {
          (
            options as (
              error: Error | null,
              stdout: string,
              stderr: string,
            ) => void
          )(null, 'test clipboard content', '');
        }
        return {} as childProcess.ChildProcess;
      });

      // Default platform to darwin
      mockPlatform.mockReturnValue('darwin');
    });

    it('should handle clipboard read error', async () => {
      // Mock exec to reject with an error (simulates clipboard read failure)
      mockExec.mockRejectedValue(new Error('xclip is not installed'));

      const result = await saveClipboardImage();

      expect(result!.filePath).toBeNull();
      expect(typeof result!.error).toBe('string');
      expect(result!.error).toBe(
        'Unsupported platform or no image in clipboard',
      );
    }, 10000); // 10 second timeout for this test

    it('should handle empty clipboard with content was recently processed', async () => {
      (
        mockExec as unknown as {
          mockImplementation: (impl: ExecMockImplementation) => void;
        }
      ).mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, '', '');
        } else if (typeof options === 'function') {
          (
            options as (
              error: Error | null,
              stdout: string,
              stderr: string,
            ) => void
          )(null, '', '');
        }
        return {} as childProcess.ChildProcess;
      });

      const result = await saveClipboardImage();

      expect(result.filePath).toBeNull();
      expect(typeof result.error).toBe('string');
      expect(result.error).toBe(
        'Unsupported platform or no image in clipboard',
      );
    });

    it('should handle unsupported platform with content was recently processed', async () => {
      mockPlatform.mockReturnValue('win32');

      const result = await saveClipboardImage();

      expect(result.filePath).toBeNull();
      expect(typeof result.error).toBe('string');
      expect(result.error).toBe(
        'Unsupported platform or no image in clipboard',
      );
    });

    it('should handle directory creation error with specific error', async () => {
      mockMkdir.mockRejectedValue(new Error('Failed to create directory'));
      const result = (await saveClipboardImage()) as SaveClipboardImageResult;
      expect(result).toEqual({
        filePath: null,
        error: 'Failed to process clipboard image: Failed to create directory',
      });
    });

    it('should not crash and return correct error on macOS (darwin)', async () => {
      mockPlatform.mockReturnValue('darwin');
      const result = await saveClipboardImage();
      expect(result.filePath).toBeNull();
      expect(typeof result.error).toBe('string');
    });
    it('should not crash and return correct error on Windows (win32)', async () => {
      mockPlatform.mockReturnValue('win32');
      const result = await saveClipboardImage();
      expect(result.filePath).toBeNull();
      expect(typeof result.error).toBe('string');
    });
    it('should not crash and return correct error on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      const result = await saveClipboardImage();
      expect(result.filePath).toBeNull();
      expect(typeof result.error).toBe('string');
    });
  });

  describe('cleanupOldClipboardImages', () => {
    const testDir = '/test/dir';
    const tempDir = `${testDir}/.gemini-clipboard`;

    beforeEach(() => {
      vi.clearAllMocks();

      // Setup default mock implementations
      mockMkdir.mockResolvedValue(undefined);
      mockStat.mockResolvedValue({
        ...mockFileStats,
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
      });
    });

    it('should clean up old clipboard images', async () => {
      // Mock readdir to return test files
      const mockDirent = (name: string) => ({
        name: Buffer.from(name),
        parentPath: tempDir,
        path: path.join(tempDir, name),
        isFile: () => true,
        isDirectory: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
      });
      vi.mocked(fs.readdir).mockResolvedValue([
        mockDirent('clipboard-123.png'),
        mockDirent('clipboard-456.jpg'),
        mockDirent('not-a-clipboard.txt'),
        mockDirent('clipboard-789.tiff'),
        mockDirent('clipboard-012.gif'),
      ]);

      // Mock stat to return files older than 1 hour
      mockStat.mockImplementation(async (filePath) => ({
        ...mockFileStats,
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
        isFile: () => !filePath.toString().includes('not-a-clipboard.txt'),
      }));

      // Mock unlink
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      // Call the function
      await cleanupOldClipboardImages(testDir);

      // Verify the correct directory was read
      expect(vi.mocked(fs.readdir)).toHaveBeenCalledWith(tempDir);

      // Verify stats were only checked for image files (4 out of 5 files)
      expect(mockStat).toHaveBeenCalledTimes(4);

      // Verify all image files were unlinked (4 files)
      expect(vi.mocked(fs.unlink)).toHaveBeenCalledTimes(4);
      expect(vi.mocked(fs.unlink)).not.toHaveBeenCalledWith(
        expect.stringContaining('not-a-clipboard.txt'),
      );
    });

    it('should handle file system errors gracefully', async () => {
      // Mock readdir to throw an error
      vi.mocked(fs.readdir).mockRejectedValue(new Error('File system error'));

      // Import and call the function
      const { cleanupOldClipboardImages } = await import('./clipboardUtils.js');

      // The function should handle the error without throwing
      await expect(cleanupOldClipboardImages(testDir)).resolves.not.toThrow();
    });
  });
});
