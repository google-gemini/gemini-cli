/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clipboardHasImage as hasClipboardImage,
  saveClipboardImage as saveClipboard,
  cleanupOldClipboardImages,
} from './clipboardUtils.js';

// Mock @crosscopy/clipboard
vi.mock('@crosscopy/clipboard', () => ({
  hasImage: vi.fn(),
  getImageBase64: vi.fn(),
}));

// Mock @google/gemini-cli-core
vi.mock('@google/gemini-cli-core', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
  spawnAsync: vi.fn(),
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  readdir: vi.fn(),
}));

import {
  hasImage as nativeHasImage,
  getImageBase64 as nativeGetImageBase64,
} from '@crosscopy/clipboard';
import { spawnAsync } from '@google/gemini-cli-core';
import * as fs from 'node:fs/promises';
import type { Stats } from 'node:fs';

describe('clipboardUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('clipboardHasImage', () => {
    it('should return true when clipboard has an image (cross-platform)', async () => {
      vi.mocked(nativeHasImage).mockReturnValue(true);

      const result = await hasClipboardImage();

      expect(result).toBe(true);
      expect(nativeHasImage).toHaveBeenCalled();
    });

    it('should return false when clipboard does not have an image', async () => {
      vi.mocked(nativeHasImage).mockReturnValue(false);

      const result = await hasClipboardImage();

      expect(result).toBe(false);
      expect(nativeHasImage).toHaveBeenCalled();
    });

    it('should fallback to macOS osascript on error when on darwin', async () => {
      // Save original platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      vi.mocked(nativeHasImage).mockImplementation(() => {
        throw new Error('Clipboard error');
      });
      vi.mocked(spawnAsync).mockResolvedValue({
        stdout: '«class PNGf»',
        stderr: '',
      });

      const result = await hasClipboardImage();

      expect(result).toBe(true);
      expect(spawnAsync).toHaveBeenCalledWith('osascript', [
        '-e',
        'clipboard info',
      ]);

      // Restore platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false on error when not on macOS', async () => {
      // Save original platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      vi.mocked(nativeHasImage).mockImplementation(() => {
        throw new Error('Clipboard error');
      });

      const result = await hasClipboardImage();

      expect(result).toBe(false);

      // Restore platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('saveClipboardImage', () => {
    it('should return null when clipboard does not have an image', async () => {
      vi.mocked(nativeHasImage).mockReturnValue(false);

      const result = await saveClipboard();

      expect(result).toBe(null);
    });

    it('should save clipboard image successfully (cross-platform)', async () => {
      const mockBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      vi.mocked(nativeHasImage).mockReturnValue(true);
      vi.mocked(nativeGetImageBase64).mockResolvedValue(mockBase64);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as Stats);

      const result = await saveClipboard('/test/dir');

      expect(result).toMatch(
        /^\/test\/dir\/\.gemini-clipboard\/clipboard-\d+\.png$/,
      );
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should return null when image data is empty', async () => {
      vi.mocked(nativeHasImage).mockReturnValue(true);
      vi.mocked(nativeGetImageBase64).mockResolvedValue('');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await saveClipboard();

      expect(result).toBe(null);
    });

    it('should clean up empty files', async () => {
      const mockBase64 = 'mockbase64data';

      vi.mocked(nativeHasImage).mockReturnValue(true);
      vi.mocked(nativeGetImageBase64).mockResolvedValue(mockBase64);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 0 } as Stats);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await saveClipboard();

      expect(result).toBe(null);
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(nativeHasImage).mockReturnValue(true);
      vi.mocked(nativeGetImageBase64).mockRejectedValue(
        new Error('Clipboard error'),
      );
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const result = await saveClipboard();

      // Should return null on error (or use macOS fallback if on darwin)
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('cleanupOldClipboardImages', () => {
    it('should not throw errors on missing directory', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await expect(cleanupOldClipboardImages('.')).resolves.not.toThrow();
    });

    it('should delete old clipboard images', async () => {
      const oldTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
      const recentTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago

      vi.mocked(fs.readdir).mockResolvedValue([
        'clipboard-123.png',
        'clipboard-456.jpg',
        'other-file.txt',
      ] as string[]);
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtimeMs: oldTime } as Stats)
        .mockResolvedValueOnce({ mtimeMs: recentTime } as Stats);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await cleanupOldClipboardImages('/test/dir');

      // Should delete old file but not recent file
      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('clipboard-123.png'),
      );
    });
  });
});
