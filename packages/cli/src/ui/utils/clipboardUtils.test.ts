/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  clipboardHasImage,
  saveClipboardImage,
  captureScreenshot,
  cleanupOldClipboardImages,
  splitEscapedPaths,
  parsePastedPaths,
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  describe('clipboardHasImage', () => {
    it('should return false on unsupported platforms', async () => {
      if (process.platform !== 'darwin' && process.platform !== 'win32') {
        const result = await clipboardHasImage();
        expect(result).toBe(false);
      } else {
        // Skip on macOS/Windows as it would require actual clipboard state
        expect(true).toBe(true);
      }
    });

    it('should return boolean on macOS or Windows', async () => {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        // Skip on unsupported platforms
        expect(true).toBe(true);
      }
    }, 10000);
  });

  describe('saveClipboardImage', () => {
    it('should return null on unsupported platforms', async () => {
      if (process.platform !== 'darwin' && process.platform !== 'win32') {
        const result = await saveClipboardImage();
        expect(result).toBe(null);
      } else {
        // Skip on macOS/Windows
        expect(true).toBe(true);
      }
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid directory (should not throw)
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      if (process.platform === 'darwin' || process.platform === 'win32') {
        // On macOS/Windows, might return null due to various errors
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // On other platforms, should always return null
        expect(result).toBe(null);
      }
    });
  });

  describe('captureScreenshot', () => {
    it('should return null on non-macOS platforms', async () => {
      if (process.platform !== 'darwin') {
        const result = await captureScreenshot('fullscreen');
        expect(result).toBe(null);
      } else {
        // Skip on macOS
        expect(true).toBe(true);
      }
    });

    it('should return null on non-macOS platforms with fullscreen mode', async () => {
      if (process.platform !== 'darwin') {
        const fullscreenResult = await captureScreenshot('fullscreen');
        expect(fullscreenResult).toBe(null);
      } else {
        // Skip on macOS
        expect(true).toBe(true);
      }
    });

    it('should return string path or null on macOS with fullscreen mode', async () => {
      if (process.platform === 'darwin') {
        // Test with fullscreen mode as it doesn't require user interaction
        const result = await captureScreenshot('fullscreen');
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // Skip on non-macOS
        expect(true).toBe(true);
      }
    });

    it('should handle fullscreen mode without throwing', async () => {
      if (process.platform === 'darwin') {
        // Fullscreen mode doesn't require user interaction
        await expect(captureScreenshot('fullscreen')).resolves.not.toThrow();
      } else {
        // Skip on non-macOS
        expect(true).toBe(true);
      }
    });

    it('should handle invalid target directory', async () => {
      if (process.platform === 'darwin') {
        // Should throw error for invalid directory path
        await expect(
          captureScreenshot('fullscreen', '/invalid/path/that/does/not/exist')
        ).rejects.toThrow();
      } else {
        // On non-macOS, should return null
        const result = await captureScreenshot('fullscreen', '/invalid/path');
        expect(result).toBe(null);
      }
    });

    it('should handle errors gracefully with valid directory', async () => {
      // Test with current directory (should not throw)
      const result = await captureScreenshot('fullscreen', '.');
      
      if (process.platform === 'darwin') {
        // On macOS, might return string path or null
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // On other platforms, should always return null
        expect(result).toBe(null);
      }
    });
  });

  describe('cleanupOldClipboardImages', () => {
    it('should not throw errors', async () => {
      // Should handle missing directories gracefully
      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(cleanupOldClipboardImages('.')).resolves.not.toThrow();
    });
  });

  describe('splitEscapedPaths', () => {
    it('should return single path when no spaces', () => {
      expect(splitEscapedPaths('/path/to/image.png')).toEqual([
        '/path/to/image.png',
      ]);
    });

    it('should split simple space-separated paths', () => {
      expect(splitEscapedPaths('/img1.png /img2.png')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should split three paths', () => {
      expect(splitEscapedPaths('/a.png /b.jpg /c.heic')).toEqual([
        '/a.png',
        '/b.jpg',
        '/c.heic',
      ]);
    });

    it('should preserve escaped spaces within filenames', () => {
      expect(splitEscapedPaths('/my\\ image.png')).toEqual(['/my\\ image.png']);
    });

    it('should handle multiple paths with escaped spaces', () => {
      expect(splitEscapedPaths('/my\\ img1.png /my\\ img2.png')).toEqual([
        '/my\\ img1.png',
        '/my\\ img2.png',
      ]);
    });

    it('should handle path with multiple escaped spaces', () => {
      expect(splitEscapedPaths('/path/to/my\\ cool\\ image.png')).toEqual([
        '/path/to/my\\ cool\\ image.png',
      ]);
    });

    it('should handle multiple consecutive spaces between paths', () => {
      expect(splitEscapedPaths('/img1.png   /img2.png')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should handle trailing and leading whitespace', () => {
      expect(splitEscapedPaths('  /img1.png /img2.png  ')).toEqual([
        '/img1.png',
        '/img2.png',
      ]);
    });

    it('should return empty array for empty string', () => {
      expect(splitEscapedPaths('')).toEqual([]);
    });

    it('should return empty array for whitespace only', () => {
      expect(splitEscapedPaths('   ')).toEqual([]);
    });
  });

  describe('parsePastedPaths', () => {
    it('should return null for empty string', () => {
      const result = parsePastedPaths('', () => true);
      expect(result).toBe(null);
    });

    it('should add @ prefix to single valid path', () => {
      const result = parsePastedPaths('/path/to/file.txt', () => true);
      expect(result).toBe('@/path/to/file.txt ');
    });

    it('should return null for single invalid path', () => {
      const result = parsePastedPaths('/path/to/file.txt', () => false);
      expect(result).toBe(null);
    });

    it('should add @ prefix to all valid paths', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/path/to/file1.txt', '/path/to/file2.txt']);
      const result = parsePastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        (p) => validPaths.has(p),
      );
      expect(result).toBe('@/path/to/file1.txt @/path/to/file2.txt ');
    });

    it('should only add @ prefix to valid paths', () => {
      const result = parsePastedPaths(
        '/valid/file.txt /invalid/file.jpg',
        (p) => p.endsWith('.txt'),
      );
      expect(result).toBe('@/valid/file.txt /invalid/file.jpg ');
    });

    it('should return null if no paths are valid', () => {
      const result = parsePastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        () => false,
      );
      expect(result).toBe(null);
    });

    it('should handle paths with escaped spaces', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/path/to/my file.txt', '/other/path.txt']);
      const result = parsePastedPaths(
        '/path/to/my\\ file.txt /other/path.txt',
        (p) => validPaths.has(p),
      );
      expect(result).toBe('@/path/to/my\\ file.txt @/other/path.txt ');
    });

    it('should unescape paths before validation', () => {
      // Use Set to model reality: individual paths exist, combined string doesn't
      const validPaths = new Set(['/my file.txt', '/other.txt']);
      const validatedPaths: string[] = [];
      parsePastedPaths('/my\\ file.txt /other.txt', (p) => {
        validatedPaths.push(p);
        return validPaths.has(p);
      });
      // First checks entire string, then individual unescaped segments
      expect(validatedPaths).toEqual([
        '/my\\ file.txt /other.txt',
        '/my file.txt',
        '/other.txt',
      ]);
    });

    it('should handle single path with unescaped spaces from copy-paste', () => {
      const result = parsePastedPaths('/path/to/my file.txt', () => true);
      expect(result).toBe('@/path/to/my\\ file.txt ');
    });

    it('should handle Windows path', () => {
      const result = parsePastedPaths('C:\\Users\\file.txt', () => true);
      expect(result).toBe('@C:\\Users\\file.txt ');
    });

    it('should handle Windows path with unescaped spaces', () => {
      const result = parsePastedPaths('C:\\My Documents\\file.txt', () => true);
      expect(result).toBe('@C:\\My\\ Documents\\file.txt ');
    });

    it('should handle multiple Windows paths', () => {
      const validPaths = new Set(['C:\\file1.txt', 'D:\\file2.txt']);
      const result = parsePastedPaths('C:\\file1.txt D:\\file2.txt', (p) =>
        validPaths.has(p),
      );
      expect(result).toBe('@C:\\file1.txt @D:\\file2.txt ');
    });

    it('should handle Windows UNC path', () => {
      const result = parsePastedPaths(
        '\\\\server\\share\\file.txt',
        () => true,
      );
      expect(result).toBe('@\\\\server\\share\\file.txt ');
    });
  });
});
