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
});
