/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { debugLogger, spawnAsync } from '@google/gemini-cli-core';

const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.tiff',
  '.bmp',
];

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

/**
 * Parses text that might be an image file path.
 * Handles paths with @ prefix and escaped spaces (e.g., @/path/to/file\ name.png)
 * @param text The text to check (typically pasted content)
 * @returns The resolved absolute path if it looks like an image path, null otherwise
 */
function parseImagePath(text: string): string | null {
  let trimmed = text.trim();

  // Remove @ prefix if present (drag-and-drop in Gemini CLI adds @)
  if (trimmed.startsWith('@')) {
    trimmed = trimmed.slice(1);
  }

  // Check if it looks like a file path (starts with / or ~ or .)
  if (!trimmed.match(/^[/~.]/)) {
    return null;
  }

  // Unescape spaces (drag-and-drop escapes spaces as "\ ")
  const unescapedPath = trimmed.replace(/\\ /g, ' ');

  // Check if it has an image extension
  const lowerPath = unescapedPath.toLowerCase();
  const hasImageExtension = IMAGE_EXTENSIONS.some((ext) =>
    lowerPath.endsWith(ext),
  );
  if (!hasImageExtension) {
    return null;
  }

  // Resolve the path (handle ~ for home directory)
  let absolutePath = unescapedPath;
  if (unescapedPath.startsWith('~')) {
    absolutePath = path.join(os.homedir(), unescapedPath.slice(1));
  } else if (!path.isAbsolute(unescapedPath)) {
    absolutePath = path.resolve(unescapedPath);
  }

  return absolutePath;
}

/**
 * Synchronously checks if text looks like an image file path (without verifying existence).
 * Use this for fast rejection of non-image text before doing async file checks.
 * @param text The text to check
 * @returns true if the text could be an image path based on format and extension
 */
export function looksLikeImagePath(text: string): boolean {
  return parseImagePath(text) !== null;
}

/**
 * Checks if a string looks like an image file path and the file exists.
 * Used for detecting drag-and-drop image files in the terminal.
 * Handles paths with @ prefix and escaped spaces (e.g., @/path/to/file\ name.png)
 * @param text The text to check (typically pasted content)
 * @returns The absolute path if valid image file, null otherwise
 */
export async function getImagePathFromText(
  text: string,
): Promise<string | null> {
  const absolutePath = parseImagePath(text);
  if (!absolutePath) {
    return null;
  }

  // Check if file exists
  try {
    await fs.access(absolutePath);
    return absolutePath;
  } catch {
    return null;
  }
}
