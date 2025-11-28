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
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  describe('clipboardHasImage', () => {
    it('should return boolean on supported platforms', async () => {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        const result = await clipboardHasImage();
        expect(result).toBe(false);
      }
    });
  });

  describe('saveClipboardImage', () => {
    it('should return path or null on supported platforms', async () => {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const result = await saveClipboardImage();
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        const result = await saveClipboardImage();
        expect(result).toBe(null);
      }
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid directory (should not throw)
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      if (process.platform === 'darwin' || process.platform === 'win32') {
        // Might return null due to errors
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // On other platforms, should always return null
        expect(result).toBe(null);
      }
    }, 10000); // Increase timeout for Windows PowerShell calls
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
