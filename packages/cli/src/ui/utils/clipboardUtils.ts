/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { debugLogger, spawnAsync } from '@google/gemini-cli-core';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Checks if the system clipboard contains an image (macOS only for now)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    // Use osascript to check clipboard type
    const { stdout } = await spawnAsync('osascript', ['-e', 'clipboard info']);
    const imageRegex =
      /«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»/;
    return imageRegex.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file (macOS only for now)
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // Create a temporary directory for clipboard images within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

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
    }

    // No format worked
    return null;
  } catch (error) {
    debugLogger.warn('Error saving clipboard image:', error);
    return null;
  }
}

/**
 * Captures a screenshot and saves it to a temporary file (macOS only for now)
 * @param targetDir The target directory to create temp files within
 * @param mode The capture mode: 'interactive' (default), 'fullscreen', 'window'
 * @returns The path to the saved screenshot file, or null if cancelled or error
 */
export async function captureScreenshot(
  mode: 'interactive' | 'fullscreen' | 'window' = 'interactive',
  targetDir?: string
): Promise<string | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // Create a temporary directory for screenshots within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, '.gemini-clipboard');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();
    const screenshotPath = path.join(tempDir, `screenshot-${timestamp}.png`);

    // Build screencapture arguments based on mode
    const args: string[] = [];
    switch (mode) {
      case 'fullscreen':
        // Capture entire screen without user interaction
        break;
      case 'window':
        // Let user select a window to capture
        args.push('-w');
        break;
      case 'interactive':
      default:
        // Interactive mode for user selection (default)
        args.push('-i');
        break;
    }
    args.push(screenshotPath);

    try {
      await execFileAsync('screencapture', args);
    } catch {
      return null;
    }
    
    // Verify the file was created and has content
    try {
      const stats = await fs.stat(screenshotPath);
      if (stats.size > 0) {
        return screenshotPath;
      }
    } catch {
      // File doesn't exist, user likely cancelled
    }

    // Clean up empty file if it exists
    try {
      await fs.unlink(screenshotPath);
    } catch {
      // Ignore cleanup errors
    }

    return null;
  } catch (error) {
    console.error('Error capturing screenshot:', error);  
    throw error;
  }
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
