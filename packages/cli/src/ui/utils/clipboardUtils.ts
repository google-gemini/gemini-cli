/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger, spawnAsync } from '@google/gemini-cli-core';
import {
  hasImage as clipboardHasImageNative,
  getImageBase64 as clipboardGetImageBase64,
} from '@crosscopy/clipboard';

/**
 * Checks if the system clipboard contains an image (Windows, macOS, Linux)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    // Use @crosscopy/clipboard for cross-platform support
    // hasImage is synchronous, returns boolean directly
    return clipboardHasImageNative();
  } catch (error) {
    // Fallback to macOS-specific implementation if @crosscopy/clipboard fails
    if (process.platform === 'darwin') {
      try {
        const { stdout } = await spawnAsync('osascript', [
          '-e',
          'clipboard info',
        ]);
        const imageRegex =
          /«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»/;
        return imageRegex.test(stdout);
      } catch {
        return false;
      }
    }
    debugLogger.warn('Error checking clipboard for image:', error);
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file (Windows, macOS, Linux)
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  try {
    // Check if clipboard has an image first
    const hasImage = await clipboardHasImage();
    if (!hasImage) {
      return null;
    }

    // Create a temporary directory for clipboard images within the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();
    const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);

    try {
      // Get image data as base64 from clipboard
      const imageBase64 = await clipboardGetImageBase64();

      if (!imageBase64) {
        // Fallback to macOS-specific implementation
        if (process.platform === 'darwin') {
          return await saveMacOSClipboardImage(tempDir, timestamp);
        }
        return null;
      }

      // Convert base64 to buffer and save
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      await fs.writeFile(tempFilePath, imageBuffer);

      // Verify the file was created and has content
      const stats = await fs.stat(tempFilePath);
      if (stats.size > 0) {
        return tempFilePath;
      }

      // Clean up if file is empty
      await fs.unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });
      return null;
    } catch (error) {
      // Fallback to macOS-specific implementation
      if (process.platform === 'darwin') {
        return await saveMacOSClipboardImage(tempDir, timestamp);
      }

      debugLogger.warn('Error saving clipboard image:', error);

      // Clean up failed attempt
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      return null;
    }
  } catch (error) {
    debugLogger.warn('Error in saveClipboardImage:', error);
    return null;
  }
}

/**
 * Fallback function for macOS-specific clipboard image saving using osascript
 * This is used when @crosscopy/clipboard fails or returns no data
 * @param tempDir The temporary directory to save the image
 * @param timestamp The timestamp to use for the filename
 * @returns The path to the saved image file, or null if failed
 */
async function saveMacOSClipboardImage(
  tempDir: string,
  timestamp: number,
): Promise<string | null> {
  // Try different image formats in order of preference
  const formats = [
    { class: 'PNGf', extension: 'png' },
    { class: 'JPEG', extension: 'jpg' },
    { class: 'TIFF', extension: 'tiff' },
    { class: 'GIFf', extension: 'gif' },
  ];

  for (const format of formats) {
    const tempFilePath = path.join(
      tempDir,
      `clipboard-${timestamp}.${format.extension}`,
    );

    // Try to save clipboard as this format
    const script = `
      try
        set imageData to the clipboard as «class ${format.class}»
        set fileRef to open for access POSIX file "${tempFilePath}" with write permission
        write imageData to fileRef
        close access fileRef
        return "success"
      on error errMsg
        try
          close access POSIX file "${tempFilePath}"
        end try
        return "error"
      end try
    `;

    try {
      const { stdout } = await spawnAsync('osascript', ['-e', script]);

      if (stdout.trim() === 'success') {
        // Verify the file was created and has content
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist, continue to next format
        }
      }

      // Clean up failed attempt
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    } catch {
      // Continue to next format
    }
  }

  // No format worked
  return null;
}

/**
 * Cleans up old temporary clipboard image files
 * Removes files older than 1 hour
 * @param targetDir The target directory where temp files are stored
 */
export async function cleanupOldClipboardImages(
  targetDir?: string,
): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    const files = await fs.readdir(tempDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const file of files) {
      if (
        file.startsWith('clipboard-') &&
        (file.endsWith('.png') ||
          file.endsWith('.jpg') ||
          file.endsWith('.tiff') ||
          file.endsWith('.gif'))
      ) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch {
    // Ignore errors in cleanup
  }
}
