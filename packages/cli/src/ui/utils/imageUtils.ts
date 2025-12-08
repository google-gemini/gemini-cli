/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { unescapePath } from '@google/gemini-cli-core';

/**
 * Supported image file extensions for clipboard/drag-and-drop operations.
 * Based on Gemini API supported MIME types: PNG, JPEG, WEBP, HEIC, HEIF.
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
  if (!trimmed.match(/^[/~.]/)) {
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
  if (!trimmed.match(/^[/~.]/)) {
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
