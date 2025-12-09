/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { debugLogger, spawnAsync, unescapePath } from '@google/gemini-cli-core';

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

/** Matches strings that start with a path prefix (/, ~, ., or Windows drive letter) */
const PATH_PREFIX_PATTERN = /^([/~.]|[a-zA-Z]:)/;

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

  // Must start with a path prefix
  if (!PATH_PREFIX_PATTERN.test(trimmed)) {
    return null;
  }

  const unescapedPath = unescapePath(trimmed);

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
 * Synchronously checks if text could contain one or more image file paths.
 * Use this for fast rejection of non-image text before doing async file checks.
 *
 * @param text The text to check
 * @returns true if text could be image path(s) based on format and extension
 */
export function looksLikeMultipleImagePaths(text: string): boolean {
  let trimmed = text.trim();

  // Remove @ prefix if present (drag-and-drop adds @)
  if (trimmed.startsWith('@')) {
    trimmed = trimmed.slice(1);
  }

  // Must start with a path prefix
  if (!PATH_PREFIX_PATTERN.test(trimmed)) {
    return false;
  }

  // Must contain at least one image extension
  const lower = trimmed.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.includes(ext));
}

/**
 * Validates multiple image paths from drag-and-drop text, checking file existence.
 * Returns valid paths for images that exist, and original segments for invalid ones.
 *
 * @param text The pasted text (potentially space-separated paths)
 * @returns Object with validPaths (absolute paths to existing images) and
 *          invalidSegments (original escaped text for non-images or missing files)
 */
export async function getMultipleImagePathsFromText(text: string): Promise<{
  validPaths: string[];
  invalidSegments: string[];
}> {
  let trimmed = text.trim();

  // Remove @ prefix from first path if present
  if (trimmed.startsWith('@')) {
    trimmed = trimmed.slice(1);
  }

  // Quick check: if text doesn't look like path(s), return empty
  if (!PATH_PREFIX_PATTERN.test(trimmed)) {
    return { validPaths: [], invalidSegments: [] };
  }

  const segments = splitEscapedPaths(trimmed);
  const validPaths: string[] = [];
  const invalidSegments: string[] = [];

  // Process segments in parallel for performance
  const results = await Promise.all(
    segments.map(async (segment) => {
      // Use core's unescapePath for consistency with rest of codebase
      const unescaped = unescapePath(segment);
      const lower = unescaped.toLowerCase();

      // Non-image extension → keep as raw text
      if (!IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        return { type: 'invalid' as const, segment };
      }

      // Resolve to absolute path
      let absolute = unescaped;
      if (unescaped.startsWith('~')) {
        absolute = path.join(os.homedir(), unescaped.slice(1));
      } else if (!path.isAbsolute(unescaped)) {
        absolute = path.resolve(unescaped);
      }

      // Check file existence
      try {
        await fs.access(absolute);
        return { type: 'valid' as const, path: absolute };
      } catch {
        return { type: 'invalid' as const, segment };
      }
    }),
  );

  // Collect results maintaining order
  for (const result of results) {
    if (result.type === 'valid') {
      validPaths.push(result.path);
    } else {
      invalidSegments.push(result.segment);
    }
  }

  return { validPaths, invalidSegments };
}

/**
 * Processes pasted text containing file paths, adding @ prefix to valid paths.
 * Handles both single and multiple space-separated paths.
 *
 * @param text The pasted text (potentially space-separated paths)
 * @param isValidPath Function to validate if a path exists/is valid
 * @returns Processed string with @ prefixes on valid paths, or null if no valid paths
 */
export function processPastedPaths(
  text: string,
  isValidPath: (path: string) => boolean,
): string | null {
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
