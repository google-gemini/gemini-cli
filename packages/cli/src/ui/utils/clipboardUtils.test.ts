/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
  getImagePathFromText,
  looksLikeImagePath,
  splitEscapedPaths,
  looksLikeMultipleImagePaths,
  getMultipleImagePathsFromText,
  processPastedPaths,
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  describe('clipboardHasImage', () => {
    it('should return false on non-macOS platforms', async () => {
      if (process.platform !== 'darwin') {
        const result = await clipboardHasImage();
        expect(result).toBe(false);
      } else {
        // Skip on macOS as it would require actual clipboard state
        expect(true).toBe(true);
      }
    });

    it('should return boolean on macOS', async () => {
      if (process.platform === 'darwin') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        // Skip on non-macOS
        expect(true).toBe(true);
      }
    });
  });

  describe('saveClipboardImage', () => {
    it('should return null on non-macOS platforms', async () => {
      if (process.platform !== 'darwin') {
        const result = await saveClipboardImage();
        expect(result).toBe(null);
      } else {
        // Skip on macOS
        expect(true).toBe(true);
      }
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid directory (should not throw)
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      if (process.platform === 'darwin') {
        // On macOS, might return null due to various errors
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

  describe('getImagePathFromText', () => {
    it('should return null for non-path strings', async () => {
      expect(await getImagePathFromText('hello world')).toBe(null);
      expect(await getImagePathFromText('not a path')).toBe(null);
      expect(await getImagePathFromText('')).toBe(null);
    });

    it('should return null for non-image file paths', async () => {
      expect(await getImagePathFromText('/path/to/file.txt')).toBe(null);
      expect(await getImagePathFromText('./script.js')).toBe(null);
      expect(await getImagePathFromText('~/document.pdf')).toBe(null);
    });

    it('should return null for non-existent image paths', async () => {
      expect(await getImagePathFromText('/nonexistent/image.png')).toBe(null);
      expect(await getImagePathFromText('./fake/photo.jpg')).toBe(null);
      expect(await getImagePathFromText('~/missing/image.heic')).toBe(null);
    });

    it('should recognize various image extensions', async () => {
      // These should return null because files don't exist,
      // but they should pass the extension check
      // Based on Gemini API supported formats: PNG, JPEG, WEBP, HEIC, HEIF
      const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
      for (const ext of extensions) {
        const result = await getImagePathFromText(`/fake/image${ext}`);
        // Should return null because file doesn't exist, not because extension is wrong
        expect(result).toBe(null);
      }
    });

    it('should handle paths starting with different prefixes', async () => {
      // All should return null because files don't exist
      expect(await getImagePathFromText('/absolute/path/image.png')).toBe(null);
      expect(await getImagePathFromText('./relative/path/image.png')).toBe(
        null,
      );
      expect(await getImagePathFromText('~/home/path/image.png')).toBe(null);
    });

    it('should return null for non-image extensions', async () => {
      const result = await getImagePathFromText('./package.json');
      expect(result).toBe(null);
    });

    it('should trim whitespace from input', async () => {
      expect(await getImagePathFromText('  /path/to/image.png  ')).toBe(null);
      expect(await getImagePathFromText('\n/path/to/image.png\n')).toBe(null);
    });

    it('should handle @ prefix from drag-and-drop', async () => {
      // Drag-and-drop in Gemini CLI adds @ prefix
      expect(await getImagePathFromText('@/nonexistent/image.png')).toBe(null);
      expect(await getImagePathFromText('@./fake/photo.jpg')).toBe(null);
      expect(await getImagePathFromText('@~/missing/image.heic')).toBe(null);
    });

    it('should handle escaped spaces from drag-and-drop', async () => {
      // Drag-and-drop escapes spaces as "\ "
      expect(await getImagePathFromText('@/path/to/my\\ image.png')).toBe(null);
      expect(
        await getImagePathFromText(
          '@/Users/test/Screenshot\\ 2025-12-06\\ at\\ 6.31.06\\ PM.png',
        ),
      ).toBe(null);
    });

    it('should reject non-image files even with @ prefix', async () => {
      expect(await getImagePathFromText('@/path/to/file.txt')).toBe(null);
      expect(await getImagePathFromText('@./script.js')).toBe(null);
    });
  });

  describe('looksLikeImagePath', () => {
    it('should return false for non-path strings', () => {
      expect(looksLikeImagePath('hello world')).toBe(false);
      expect(looksLikeImagePath('not a path')).toBe(false);
      expect(looksLikeImagePath('')).toBe(false);
    });

    it('should return false for non-image file paths', () => {
      expect(looksLikeImagePath('/path/to/file.txt')).toBe(false);
      expect(looksLikeImagePath('./script.js')).toBe(false);
      expect(looksLikeImagePath('~/document.pdf')).toBe(false);
    });

    it('should return true for paths with image extensions', () => {
      // Based on Gemini API supported formats: PNG, JPEG, WEBP, HEIC, HEIF
      expect(looksLikeImagePath('/path/to/image.png')).toBe(true);
      expect(looksLikeImagePath('./photo.jpg')).toBe(true);
      expect(looksLikeImagePath('/file.webp')).toBe(true);
      expect(looksLikeImagePath('/file.jpeg')).toBe(true);
      expect(looksLikeImagePath('/file.heic')).toBe(true);
      expect(looksLikeImagePath('/file.heif')).toBe(true);
    });

    it('should return false for unsupported image formats', () => {
      // GIF, TIFF, BMP are NOT supported by Gemini API
      expect(looksLikeImagePath('~/screenshot.gif')).toBe(false);
      expect(looksLikeImagePath('/file.bmp')).toBe(false);
      expect(looksLikeImagePath('/file.tiff')).toBe(false);
    });

    it('should return true for @ prefixed image paths', () => {
      expect(looksLikeImagePath('@/path/to/image.png')).toBe(true);
      expect(looksLikeImagePath('@./photo.jpg')).toBe(true);
      expect(looksLikeImagePath('@~/screenshot.heic')).toBe(true);
    });

    it('should return true for paths with escaped spaces', () => {
      expect(looksLikeImagePath('@/path/to/my\\ image.png')).toBe(true);
      expect(
        looksLikeImagePath(
          '@/Users/test/Screenshot\\ 2025-12-06\\ at\\ 6.31.06\\ PM.png',
        ),
      ).toBe(true);
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

  describe('looksLikeMultipleImagePaths', () => {
    it('should return true for single image path', () => {
      expect(looksLikeMultipleImagePaths('/path/image.png')).toBe(true);
    });

    it('should return true for multiple image paths', () => {
      expect(looksLikeMultipleImagePaths('/img1.png /img2.jpg')).toBe(true);
    });

    it('should return true for @ prefixed paths', () => {
      expect(looksLikeMultipleImagePaths('@/img1.png /img2.png')).toBe(true);
    });

    it('should return true if any path has image extension', () => {
      // Mixed image and non-image - should return true because .png is present
      expect(looksLikeMultipleImagePaths('/img.png /file.txt')).toBe(true);
    });

    it('should return false for non-path text', () => {
      expect(looksLikeMultipleImagePaths('hello world')).toBe(false);
    });

    it('should return false for paths without image extensions', () => {
      expect(looksLikeMultipleImagePaths('/file.txt /doc.pdf')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(looksLikeMultipleImagePaths('')).toBe(false);
    });

    it('should handle paths with escaped spaces', () => {
      expect(
        looksLikeMultipleImagePaths('/my\\ image.png /other\\ pic.jpg'),
      ).toBe(true);
    });
  });

  describe('getMultipleImagePathsFromText', () => {
    it('should return empty arrays for non-path text', async () => {
      const result = await getMultipleImagePathsFromText('hello world');
      expect(result.validPaths).toEqual([]);
      expect(result.invalidSegments).toEqual([]);
    });

    it('should put non-existent image paths in invalidSegments', async () => {
      const result = await getMultipleImagePathsFromText(
        '/nonexistent/image.png',
      );
      expect(result.validPaths).toEqual([]);
      expect(result.invalidSegments).toEqual(['/nonexistent/image.png']);
    });

    it('should put non-image extensions in invalidSegments', async () => {
      const result = await getMultipleImagePathsFromText('/path/to/file.txt');
      expect(result.validPaths).toEqual([]);
      expect(result.invalidSegments).toEqual(['/path/to/file.txt']);
    });

    it('should handle multiple non-existent paths', async () => {
      const result = await getMultipleImagePathsFromText(
        '/fake1.png /fake2.jpg',
      );
      expect(result.validPaths).toEqual([]);
      expect(result.invalidSegments).toEqual(['/fake1.png', '/fake2.jpg']);
    });

    it('should handle mix of image and non-image paths', async () => {
      const result = await getMultipleImagePathsFromText(
        '/fake.png /file.txt /another.jpg',
      );
      expect(result.validPaths).toEqual([]);
      // .png and .jpg are images (but don't exist), .txt is not an image
      expect(result.invalidSegments).toContain('/file.txt');
      expect(result.invalidSegments).toContain('/fake.png');
      expect(result.invalidSegments).toContain('/another.jpg');
    });

    it('should strip @ prefix from first path', async () => {
      const result = await getMultipleImagePathsFromText(
        '@/fake1.png /fake2.png',
      );
      // Both should fail because files don't exist
      expect(result.validPaths).toEqual([]);
      // The @ should be stripped from the first segment
      expect(result.invalidSegments).toEqual(['/fake1.png', '/fake2.png']);
    });

    it('should handle paths with escaped spaces', async () => {
      const result = await getMultipleImagePathsFromText(
        '/my\\ image.png /other\\ pic.jpg',
      );
      expect(result.validPaths).toEqual([]);
      // Original escaped segments should be preserved in invalidSegments
      expect(result.invalidSegments).toEqual([
        '/my\\ image.png',
        '/other\\ pic.jpg',
      ]);
    });

    it('should return empty for empty string', async () => {
      const result = await getMultipleImagePathsFromText('');
      expect(result.validPaths).toEqual([]);
      expect(result.invalidSegments).toEqual([]);
    });
  });

  describe('processPastedPaths', () => {
    it('should return null for empty string', () => {
      const result = processPastedPaths('', () => true);
      expect(result).toBe(null);
    });

    it('should add @ prefix to single valid path', () => {
      const result = processPastedPaths('/path/to/file.txt', () => true);
      expect(result).toBe('@/path/to/file.txt ');
    });

    it('should return null for single invalid path', () => {
      const result = processPastedPaths('/path/to/file.txt', () => false);
      expect(result).toBe(null);
    });

    it('should add @ prefix to all valid paths', () => {
      const result = processPastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        () => true,
      );
      expect(result).toBe('@/path/to/file1.txt @/path/to/file2.txt ');
    });

    it('should only add @ prefix to valid paths', () => {
      const result = processPastedPaths(
        '/valid/file.txt /invalid/file.jpg',
        (p) => p.endsWith('.txt'),
      );
      expect(result).toBe('@/valid/file.txt /invalid/file.jpg ');
    });

    it('should return null if no paths are valid', () => {
      const result = processPastedPaths(
        '/path/to/file1.txt /path/to/file2.txt',
        () => false,
      );
      expect(result).toBe(null);
    });

    it('should handle paths with escaped spaces', () => {
      const result = processPastedPaths(
        '/path/to/my\\ file.txt /other/path.txt',
        () => true,
      );
      expect(result).toBe('@/path/to/my\\ file.txt @/other/path.txt ');
    });

    it('should unescape paths before validation', () => {
      const validatedPaths: string[] = [];
      processPastedPaths('/my\\ file.txt /other.txt', (p) => {
        validatedPaths.push(p);
        return true;
      });
      expect(validatedPaths).toEqual(['/my file.txt', '/other.txt']);
    });
  });
});
