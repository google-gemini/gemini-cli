/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import os from 'os';
import { detect as chardetDetect } from 'chardet';

// Cache for system encoding to avoid repeated detection
// Use undefined to indicate "not yet checked" vs null meaning "checked but failed"
let cachedSystemEncoding: string | null | undefined = undefined;

/**
 * Reset the encoding cache - useful for testing
 */
export function resetEncodingCache(): void {
  cachedSystemEncoding = undefined;
}

/**
 * Returns the system encoding, caching the result to avoid repeated system calls.
 * If system encoding detection fails, falls back to detecting from the provided buffer.
 * Note: Only the system encoding is cached - buffer-based detection runs for each buffer
 * since different buffers may have different encodings.
 * @param buffer A buffer to use for detecting encoding if system detection fails.
 */
export function getCachedEncodingForBuffer(buffer: Buffer): string {
  // Cache system encoding detection since it's system-wide
  if (cachedSystemEncoding === undefined) {
    cachedSystemEncoding = getSystemEncoding();
  }

  // If we have a cached system encoding, use it
  if (cachedSystemEncoding) {
    return cachedSystemEncoding;
  }

  // Otherwise, detect from this specific buffer (don't cache this result)
  return detectEncodingFromBuffer(buffer) || 'utf-8';
}

/**
 * Detects the system encoding based on the platform.
 * For Windows, it uses the 'chcp' command to get the current code page.
 * For Unix-like systems, it checks environment variables like LC_ALL, LC_CTYPE, and LANG.
 * If those are not set, it tries to run 'locale charmap' to get the encoding.
 * If detection fails, it returns null.
 * @returns The system encoding as a string, or null if detection fails.
 */
export function getSystemEncoding(): string | null {
  // Windows
  if (os.platform() === 'win32') {
    try {
      const output = execSync('chcp', { encoding: 'utf8' });
      const match = output.match(/:\s*(\d+)/);
      if (match) {
        const codePage = parseInt(match[1], 10);
        if (!isNaN(codePage)) {
          return windowsCodePageToEncoding(codePage);
        }
      }
      // Only warn if we can't parse the output format, not if windowsCodePageToEncoding fails
      throw new Error(
        `Unable to parse Windows code page from 'chcp' output "${output.trim()}". `,
      );
    } catch (error) {
      console.warn(
        `Failed to get Windows code page using 'chcp' command: ${error instanceof Error ? error.message : String(error)}. ` +
          `Will attempt to detect encoding from command output instead.`,
      );
    }
    return null;
  }

  // Unix-like
  // Use environment variables LC_ALL, LC_CTYPE, and LANG to determine the
  // system encoding. However, these environment variables might not always
  // be set or accurate. Handle cases where none of these variables are set.
  const env = process.env;
  let locale = env['LC_ALL'] || env['LC_CTYPE'] || env['LANG'] || '';

  // Fallback to querying the system directly when environment variables are missing
  if (!locale) {
    try {
      locale = execSync('locale charmap', { encoding: 'utf8' })
        .toString()
        .trim();
    } catch (_e) {
      console.warn('Failed to get locale charmap.');
      return null;
    }
  }

  const match = locale.match(/\.(.+)/); // e.g., "en_US.UTF-8"
  if (match && match[1]) {
    return match[1].toLowerCase();
  }

  // Handle cases where locale charmap returns just the encoding name (e.g., "UTF-8")
  if (locale && !locale.includes('.')) {
    return locale.toLowerCase();
  }

  return null;
}

/**
 * Converts a Windows code page number to a corresponding encoding name.
 * @param cp The Windows code page number (e.g., 437, 850, etc.)
 * @returns The corresponding encoding name as a string, or null if no mapping exists.
 */
export function windowsCodePageToEncoding(cp: number): string | null {
  // Most common mappings; extend as needed
  const map: { [key: number]: string } = {
    437: 'cp437',
    850: 'cp850',
    852: 'cp852',
    866: 'cp866',
    874: 'windows-874',
    932: 'shift_jis',
    936: 'gb2312',
    949: 'euc-kr',
    950: 'big5',
    1200: 'utf-16le',
    1201: 'utf-16be',
    1250: 'windows-1250',
    1251: 'windows-1251',
    1252: 'windows-1252',
    1253: 'windows-1253',
    1254: 'windows-1254',
    1255: 'windows-1255',
    1256: 'windows-1256',
    1257: 'windows-1257',
    1258: 'windows-1258',
    65001: 'utf-8',
  };

  if (map[cp]) {
    return map[cp];
  }

  console.warn(`Unable to determine encoding for windows code page ${cp}.`);
  return null; // Return null if no mapping found
}

/**
 * Attempts to detect encoding from a buffer using chardet.
 * This is useful when system encoding detection fails.
 * Returns the detected encoding in lowercase, or null if detection fails.
 * @param buffer The buffer to analyze for encoding.
 * @return The detected encoding as a lowercase string, or null if detection fails.
 */
export function detectEncodingFromBuffer(buffer: Buffer): string | null {
  try {
    const detected = chardetDetect(buffer);
    if (detected && typeof detected === 'string') {
      return detected.toLowerCase();
    }
  } catch (error) {
    console.warn('Failed to detect encoding with chardet:', error);
  }

  return null;
}
