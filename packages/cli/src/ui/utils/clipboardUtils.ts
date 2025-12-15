/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  debugLogger,
  spawnAsync,
  unescapePath,
  escapePath,
} from '@google/gemini-cli-core';

/**
 * Supported image file extensions based on Gemini API.
 * See: https://ai.google.dev/gemini-api/docs/image-understanding
 */
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.heif',
];

/** Matches strings that start with a path prefix (/, ~, ., Windows drive letter, or UNC path) */
const PATH_PREFIX_PATTERN = /^([/~.]|[a-zA-Z]:|\\\\)/;

/**
 * Checks if the system clipboard contains an image (macOS and Windows)
 * @returns true if clipboard contains an image
 */
export async function clipboardHasImage(): Promise<boolean> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await spawnAsync('powershell', [
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()',
      ]);
      return stdout.trim() === 'True';
    } catch (error) {
      debugLogger.warn('Error checking clipboard for image:', error);
      return false;
    }
  }

  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    // Use osascript to check clipboard type
    const { stdout } = await spawnAsync('osascript', ['-e', 'clipboard info']);
    const imageRegex =
      /«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»/;
    return imageRegex.test(stdout);
  } catch (error) {
    debugLogger.warn('Error checking clipboard for image:', error);
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file (macOS and Windows)
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
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

    if (process.platform === 'win32') {
      const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);
      // The path is used directly in the PowerShell script.
      const psPath = tempFilePath.replace(/'/g, "''");

      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
          $image = [System.Windows.Forms.Clipboard]::GetImage()
          $image.Save('${psPath}', [System.Drawing.Imaging.ImageFormat]::Png)
          Write-Output "success"
        }
      `;

      const { stdout } = await spawnAsync('powershell', [
        '-NoProfile',
        '-Command',
        script,
      ]);

      if (stdout.trim() === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist
        }
      }
      return null;
    }

    // AppleScript clipboard classes to try, in order of preference.
    // macOS converts clipboard images to these formats (WEBP/HEIC/HEIF not supported by osascript).
    const formats = [
      { class: 'PNGf', extension: 'png' },
      { class: 'JPEG', extension: 'jpg' },
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
        } catch (e) {
          // File doesn't exist, continue to next format
          debugLogger.debug('Clipboard image file not found:', tempFilePath, e);
        }
      }

      // Clean up failed attempt
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        // Ignore cleanup errors
        debugLogger.debug('Failed to clean up temp file:', tempFilePath, e);
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
      const ext = path.extname(file).toLowerCase();
      if (file.startsWith('clipboard-') && IMAGE_EXTENSIONS.includes(ext)) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch (e) {
    // Ignore errors in cleanup
    debugLogger.debug('Failed to clean up old clipboard images:', e);
  }
}

/**
 * Splits text into individual path segments, respecting escaped spaces.
 * Unescaped spaces act as separators between paths, while "\ " is preserved
 * as part of a filename.
 *
 * Example: "/img1.png /path/my\ image.png" → ["/img1.png", "/path/my\ image.png"]
 *
 * @param text The text to split
 * @returns Array of path segments (still escaped)
 */
export function splitEscapedPaths(text: string): string[] {
  const paths: string[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (char === '\\' && i + 1 < text.length && text[i + 1] === ' ') {
      // Escaped space - part of filename, preserve the escape sequence
      current += '\\ ';
      i += 2;
    } else if (char === ' ') {
      // Unescaped space - path separator
      if (current.trim()) {
        paths.push(current.trim());
      }
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }

  // Don't forget the last segment
  if (current.trim()) {
    paths.push(current.trim());
  }

  return paths;
}

/**
 * Processes pasted text containing file paths, adding @ prefix to valid paths.
 * Handles both single and multiple space-separated paths.
 *
 * @param text The pasted text (potentially space-separated paths)
 * @param isValidPath Function to validate if a path exists/is valid
 * @returns Processed string with @ prefixes on valid paths, or null if no valid paths
 */
export function parsePastedPaths(
  text: string,
  isValidPath: (path: string) => boolean,
): string | null {
  // First, check if the entire text is a single valid path
  if (PATH_PREFIX_PATTERN.test(text) && isValidPath(text)) {
    return `@${escapePath(text)} `;
  }

  // Otherwise, try splitting on unescaped spaces
  const segments = splitEscapedPaths(text);
  if (segments.length === 0) {
    return null;
  }

  let anyValidPath = false;
  const processedPaths = segments.map((segment) => {
    // Quick rejection: skip segments that can't be paths
    if (!PATH_PREFIX_PATTERN.test(segment)) {
      return segment;
    }
    const unescaped = unescapePath(segment);
    if (isValidPath(unescaped)) {
      anyValidPath = true;
      return `@${segment}`;
    }
    return segment;
  });

  return anyValidPath ? processedPaths.join(' ') + ' ' : null;
}
