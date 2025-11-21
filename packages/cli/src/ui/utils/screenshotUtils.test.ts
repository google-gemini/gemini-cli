/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  isScreenshotAvailable,
  listDisplays,
  captureScreenshot,
  captureScreenshotFromDisplay,
  cleanupOldScreenshots,
} from './screenshotUtils.js';

// Mock node-screenshots module
vi.mock('node-screenshots', () => {
  const mockImage = {
    width: 1920,
    height: 1080,
    toPngSync: vi.fn(),
  };

  const mockMonitor = {
    id: 1,
    name: 'Mock Display',
    width: 1920,
    height: 1080,
    x: 0,
    y: 0,
    rotation: 0,
    scaleFactor: 1,
    frequency: 60,
    isPrimary: true,
    captureImageSync: vi.fn(() => mockImage),
  };

  return {
    Monitor: {
      all: vi.fn(() => [mockMonitor]),
    },
    Image: vi.fn(),
    Window: vi.fn(),
  };
});

describe('screenshotUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isScreenshotAvailable', () => {
    it('should return true when node-screenshots is available', async () => {
      const result = await isScreenshotAvailable();
      expect(result).toBe(true);
    });
  });

  describe('listDisplays', () => {
    it('should return list of available displays', async () => {
      const displays = await listDisplays();
      expect(displays).toHaveLength(1);
      expect(displays[0]).toEqual({
        id: 1,
        name: 'Mock Display',
        width: 1920,
        height: 1080,
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock Monitor.all to throw error
      const { Monitor } = await import('node-screenshots');
      vi.mocked(Monitor.all).mockImplementationOnce(() => {
        throw new Error('Display error');
      });

      const displays = await listDisplays();
      expect(displays).toEqual([]);
    });
  });

  describe('captureScreenshot', () => {
    const testTempDir = path.join(process.cwd(), '.gemini-screenshots-test');

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testTempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should capture screenshot from primary display', async () => {
      // Mock screenshot data
      const mockImageData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      const { Monitor } = await import('node-screenshots');
      const mockMonitor = Monitor.all()[0];
      const mockImage = mockMonitor.captureImageSync();
      if (mockImage) {
        vi.mocked(mockImage.toPngSync).mockReturnValue(mockImageData);
      }

      const result = await captureScreenshot(testTempDir);

      expect(result).not.toBe(null);
      expect(result).toContain('.gemini-screenshots-test');
      expect(result).toMatch(/screenshot-\d+\.png$/);

      // Verify file exists and has correct content
      if (result) {
        const fileContent = await fs.readFile(result);
        expect(fileContent).toEqual(mockImageData);
      }
    });

    it('should return null when capture fails', async () => {
      const { Monitor } = await import('node-screenshots');
      const mockMonitor = Monitor.all()[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(mockMonitor.captureImageSync).mockReturnValue(null as any);

      const result = await captureScreenshot(testTempDir);
      expect(result).toBe(null);
    });

    it('should create screenshot directory if it does not exist', async () => {
      const mockImageData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      const { Monitor } = await import('node-screenshots');
      const mockMonitor = Monitor.all()[0];
      const mockImage = mockMonitor.captureImageSync();
      if (mockImage) {
        vi.mocked(mockImage.toPngSync).mockReturnValue(mockImageData);
      }

      const result = await captureScreenshot(testTempDir);
      expect(result).not.toBe(null);

      // Verify directory was created
      const dirExists = await fs
        .access(path.join(testTempDir, '.gemini-screenshots'))
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('captureScreenshotFromDisplay', () => {
    const testTempDir = path.join(process.cwd(), '.gemini-screenshots-test2');

    afterEach(async () => {
      // Clean up test directory
      try {
        await fs.rm(testTempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should capture screenshot from specified display', async () => {
      const mockImageData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);

      const { Monitor } = await import('node-screenshots');
      const mockMonitor = Monitor.all()[0];
      const mockImage = mockMonitor.captureImageSync();
      if (mockImage) {
        vi.mocked(mockImage.toPngSync).mockReturnValue(mockImageData);
      }

      const result = await captureScreenshotFromDisplay(1, testTempDir);

      expect(result).not.toBe(null);
      expect(result).toMatch(/screenshot-\d+\.png$/);
    });

    it('should return null for invalid display ID', async () => {
      const result = await captureScreenshotFromDisplay(999, testTempDir);
      expect(result).toBe(null);
    });

    it('should return null for negative display ID', async () => {
      const result = await captureScreenshotFromDisplay(-1, testTempDir);
      expect(result).toBe(null);
    });
  });

  describe('cleanupOldScreenshots', () => {
    const testTempDir = path.join(process.cwd(), '.gemini-screenshots-cleanup');
    const screenshotDir = path.join(testTempDir, '.gemini-screenshots');

    beforeEach(async () => {
      // Create test directory structure
      await fs.mkdir(screenshotDir, { recursive: true });
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
        cleanupOldScreenshots('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(cleanupOldScreenshots(testTempDir)).resolves.not.toThrow();
    });

    it('should remove old screenshot files', async () => {
      // Create an old file (2 hours ago)
      const oldFile = path.join(screenshotDir, 'screenshot-1000000000.png');
      await fs.writeFile(oldFile, 'old screenshot data');

      // Set modification time to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);

      await cleanupOldScreenshots(testTempDir);

      // File should be deleted
      const fileExists = await fs
        .access(oldFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });

    it('should keep recent screenshot files', async () => {
      // Create a recent file
      const recentFile = path.join(screenshotDir, 'screenshot-2000000000.png');
      await fs.writeFile(recentFile, 'recent screenshot data');

      await cleanupOldScreenshots(testTempDir);

      // File should still exist
      const fileExists = await fs
        .access(recentFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('should only clean up screenshot files', async () => {
      // Create a non-screenshot file
      const otherFile = path.join(screenshotDir, 'other-file.txt');
      await fs.writeFile(otherFile, 'other file data');

      // Set modification time to 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await fs.utimes(otherFile, twoHoursAgo, twoHoursAgo);

      await cleanupOldScreenshots(testTempDir);

      // File should still exist (not a screenshot file)
      const fileExists = await fs
        .access(otherFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });
});
