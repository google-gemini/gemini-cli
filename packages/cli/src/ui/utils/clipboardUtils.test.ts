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
    it('should return boolean on all platforms', async () => {
      const result = await clipboardHasImage();
      expect(typeof result).toBe('boolean');
    });

    it('should handle clipboard detection gracefully', async () => {
      // Test that the function doesn't throw errors
      await expect(clipboardHasImage()).resolves.not.toThrow();
    });
  });

  describe('saveClipboardImage', () => {
    it('should return string or null on all platforms', async () => {
      const result = await saveClipboardImage();
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid directory (should not throw)
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      // On all platforms, should handle invalid paths gracefully
      expect(result === null || typeof result === 'string').toBe(true);
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
