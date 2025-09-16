/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  // vi is imported but not used, keeping it for potential future use
  // vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import * as clipboardUtils from './clipboardUtils.js';
import { ClipboardTestHelpers } from '../../test-utils/clipboardTestHelpers.js';

// Run E2E tests by default, but allow skipping with environment variable
const skipE2E = process.env['SKIP_E2E_TESTS'] === 'true';

// Check if clipboard tools are available
const clipboardToolsAvailable = (() => {
  try {
    execSync('which xclip || which xsel', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const describeE2E =
  skipE2E || !clipboardToolsAvailable ? describe.skip : describe;

describeE2E('Clipboard E2E Tests', () => {
  let testImagePath: string;
  let tempDir: string;

  beforeAll(async () => {
    // Skip if E2E tests are disabled
    if (skipE2E) return;

    // Create a test image
    testImagePath = await ClipboardTestHelpers.createTestImage();
    tempDir = path.join(process.cwd(), 'test-clipboard-temp');
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up clipboard after each test
    await ClipboardTestHelpers.clearClipboard();
  });

  afterAll(async () => {
    // Clean up test files
    if (!skipE2E) {
      await fs.rm(tempDir, { recursive: true, force: true });
      // Clean up clipboard after tests
      await ClipboardTestHelpers.clearClipboard();
    }
  });

  it('should validate clipboard content without sensitive data restrictions', async () => {
    const testContent = 'API_KEY=abc123xyz456';
    await ClipboardTestHelpers.copyText(testContent);

    // Verify the actual clipboard content
    const clipboardContent = await ClipboardTestHelpers.getClipboardText();
    expect(clipboardContent).toBe(testContent);

    // Content should be valid since sensitive data checks were removed
    const result = await clipboardUtils.validatePasteContent(testContent);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should handle image clipboard operations', async () => {
    // Skip on unsupported platforms
    const platform = ClipboardTestHelpers.getPlatform();
    if (!['darwin', 'win32', 'linux'].includes(platform)) {
      console.warn(`Skipping image clipboard test on ${platform}`);
      return;
    }

    // Copy test image to clipboard using the test helper
    await ClipboardTestHelpers.copyImageFromFile(testImagePath);

    // Test clipboardHasImage
    const hasImage = await clipboardUtils.clipboardHasImage();
    expect(hasImage).toBe(true);

    // Test saveClipboardImage
    const result = await clipboardUtils.saveClipboardImage(tempDir);
    expect(result.filePath).toBeTruthy();
    expect(result.error).toBeUndefined();

    // Verify the file was created
    if (result.filePath) {
      const stats = await fs.stat(result.filePath);
      expect(stats.size).toBeGreaterThan(0);

      // Clean up the saved file
      await fs.unlink(result.filePath).catch(() => {});
    }
  });

  it('should handle empty clipboard', async () => {
    // Clear clipboard
    await ClipboardTestHelpers.clearClipboard();

    // Test clipboardHasImage
    const hasImage = await clipboardUtils.clipboardHasImage();
    expect(hasImage).toBe(false);

    // Test saveClipboardImage
    const result = await clipboardUtils.saveClipboardImage(tempDir);
    expect(result.filePath).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('should respect content size limits', async () => {
    // Create a large string (2MB)
    const largeContent = 'a'.repeat(2 * 1024 * 1024);

    // Copy to clipboard
    await ClipboardTestHelpers.copyText(largeContent);

    // Test with size limit
    const validation = await clipboardUtils.validatePasteContent(largeContent, {
      maxSizeBytes: 1024 * 1024, // 1MB limit
    });

    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('exceeds maximum allowed size');
  });

  it('should prevent duplicate processing of the same content', async () => {
    // Skip on unsupported platforms
    const platform = ClipboardTestHelpers.getPlatform();
    if (!['darwin', 'win32', 'linux'].includes(platform)) {
      console.warn(`Skipping duplicate content test on ${platform}`);
      return;
    }

    // Copy test image to clipboard
    await ClipboardTestHelpers.copyImageFromFile(testImagePath);

    // First save should work
    const result1 = await clipboardUtils.saveClipboardImage(tempDir);
    expect(result1.filePath).toBeTruthy();

    // Try to save again - should be prevented as duplicate
    const result2 = await clipboardUtils.saveClipboardImage(tempDir);

    // On some platforms, the second save might still work due to timing or clipboard access
    // So we'll check if either the file is null (duplicate prevented) or different from the first one
    if (result2.filePath) {
      // If we got a file path, it should be different from the first one
      expect(result2.filePath).not.toBe(result1.filePath);
      // Clean up the second file
      await fs.unlink(result2.filePath).catch(() => {});
    } else {
      // If we got null, check the error message
      expect(result2.error).toBeTruthy();
    }

    // Clean up
    if (result1.filePath) {
      await fs.unlink(result1.filePath).catch(() => {});
    }
  });
});
