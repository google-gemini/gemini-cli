/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from './clipboardUtils.js';

// Mock the @crosscopy/clipboard module
vi.mock('@crosscopy/clipboard', () => ({
    default: {
      hasImage: vi.fn(),
      getImageBase64: vi.fn(),
    },
  }));

// Import the mocked module
import Clipboard from '@crosscopy/clipboard';

describe('clipboardUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clipboardHasImage', () => {
    it('should return true when clipboard has an image', async () => {
      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);

      const result = await clipboardHasImage();
      expect(result).toBe(true);
      expect(Clipboard.hasImage).toHaveBeenCalledTimes(1);
    });

    it('should return false when clipboard has no image', async () => {
      vi.mocked(Clipboard.hasImage).mockResolvedValue(false);

      const result = await clipboardHasImage();
      expect(result).toBe(false);
      expect(Clipboard.hasImage).toHaveBeenCalledTimes(1);
    });

    it('should return false on error', async () => {
      vi.mocked(Clipboard.hasImage).mockRejectedValue(
        new Error('Clipboard access error'),
      );

      const result = await clipboardHasImage();
      expect(result).toBe(false);
    });
  });

  describe('saveClipboardImage', () => {
    const testTempDir = path.join(process.cwd(), '.gemini-clipboard-test');

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testTempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should return null when clipboard has no image', async () => {
      vi.mocked(Clipboard.hasImage).mockResolvedValue(false);

      const result = await saveClipboardImage(testTempDir);
      expect(result).toBe(null);
    });

    it('should save PNG image from clipboard', async () => {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const base64PNG = pngData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64PNG);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toContain('.gemini-clipboard-test');
      expect(result).toMatch(/clipboard-\d+\.png$/);

      // Verify file exists and has correct content
      if (result) {
        const fileContent = await fs.readFile(result);
        expect(fileContent).toEqual(pngData);
      }
    });

    it('should save JPEG image from clipboard', async () => {
      // JPEG magic bytes: FF D8 FF E0
      const jpegData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const base64JPEG = jpegData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64JPEG);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toMatch(/clipboard-\d+\.jpg$/);
    });

    it('should save GIF image from clipboard', async () => {
      // GIF magic bytes: 47 49 46 38 39 61
      const gifData = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      const base64GIF = gifData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64GIF);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toMatch(/clipboard-\d+\.gif$/);
    });

    it('should save WebP image from clipboard', async () => {
      // WebP magic bytes: RIFF....WEBP
      const webpData = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      ]);
      const base64WebP = webpData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64WebP);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toMatch(/clipboard-\d+\.webp$/);
    });

    it('should default to PNG for unknown format', async () => {
      // Random bytes that don't match any known format
      const unknownData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const base64Unknown = unknownData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64Unknown);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toMatch(/clipboard-\d+\.png$/);
    });

    it('should return null when getImageBase64 returns empty string', async () => {
      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue('');

      const result = await saveClipboardImage(testTempDir);
      expect(result).toBe(null);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(Clipboard.hasImage).mockRejectedValue(
        new Error('Clipboard error'),
      );

      const result = await saveClipboardImage(testTempDir);
      expect(result).toBe(null);
    });

    it('should create .gemini-clipboard directory if it does not exist', async () => {
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const base64PNG = pngData.toString('base64');

      vi.mocked(Clipboard.hasImage).mockResolvedValue(true);
      vi.mocked(Clipboard.getImageBase64).mockResolvedValue(base64PNG);

      const result = await saveClipboardImage(testTempDir);

      expect(result).not.toBe(null);

      // Verify directory was created
      const dirExists = await fs
        .access(path.join(testTempDir, '.gemini-clipboard'))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('cleanupOldClipboardImages', () => {
    const testTempDir = path.join(process.cwd(), '.gemini-clipboard-cleanup');
    const clipboardDir = path.join(testTempDir, '.gemini-clipboard');

    beforeEach(async () => {
      // Create test directory structure
      await fs.mkdir(clipboardDir, { recursive: true });
    });

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testTempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should not throw errors when directory does not exist', async () => {
      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(
        cleanupOldClipboardImages(testTempDir),
      ).resolves.not.toThrow();
    });

    it('should remove old clipboard images', async () => {
      // Create an old file (2 hours ago)
      const oldFile = path.join(clipboardDir, 'clipboard-1000000000.png');
      await fs.writeFile(oldFile, 'old image data');

      // Set modification time to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);

      await cleanupOldClipboardImages(testTempDir);

      // File should be deleted
      const fileExists = await fs
        .access(oldFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });

    it('should keep recent clipboard images', async () => {
      // Create a recent file
      const recentFile = path.join(clipboardDir, 'clipboard-2000000000.png');
      await fs.writeFile(recentFile, 'recent image data');

      await cleanupOldClipboardImages(testTempDir);

      // File should still exist
      const fileExists = await fs
        .access(recentFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should only clean up clipboard image files', async () => {
      // Create a non-clipboard file
      const otherFile = path.join(clipboardDir, 'other-file.txt');
      await fs.writeFile(otherFile, 'other file data');

      // Set modification time to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(otherFile, twoHoursAgo, twoHoursAgo);

      await cleanupOldClipboardImages(testTempDir);

      // File should still exist (not a clipboard file)
      const fileExists = await fs
        .access(otherFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should handle multiple file formats', async () => {
      const formats = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff'];
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Create old files with different formats
      for (const format of formats) {
        const oldFile = path.join(
          clipboardDir,
          `clipboard-${Date.now()}.${format}`,
        );
        await fs.writeFile(oldFile, `old ${format} data`);
        await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);
      }

      await cleanupOldClipboardImages(testTempDir);

      // All files should be deleted
      const files = await fs.readdir(clipboardDir);
      const clipboardFiles = files.filter((f) => f.startsWith('clipboard-'));
      expect(clipboardFiles.length).toBe(0);
    });
  });
});
