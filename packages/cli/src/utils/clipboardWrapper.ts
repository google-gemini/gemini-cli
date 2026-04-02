/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';

// Clipboardy uses system-architecture which calls sysctl on macOS.
// This can fail with ENOENT if sysctl is not in PATH (e.g., on some macOS Intel setups).
// We dynamically import clipboardy to handle this gracefully.

let clipboardyModule: typeof import('clipboardy').default | undefined;
let clipboardyError: Error | undefined;

try {
  // Dynamic import to catch errors at runtime rather than module load time
  const module = await import('clipboardy');
  clipboardyModule = module.default;
} catch (error) {
  clipboardyError = error as Error;
  debugLogger.warn('Failed to load clipboardy module:', error);
}

function getClipboardy(): typeof import('clipboardy').default {
  if (!clipboardyModule) {
    throw new Error(
      `Clipboard functionality is unavailable: ${clipboardyError?.message ?? 'Unknown error'}. ` +
        'This may happen if sysctl is not in PATH on macOS.'
    );
  }
  return clipboardyModule;
}

/**
 * Read text from the clipboard.
 * @returns The clipboard text content
 * @throws If clipboardy module failed to load
 */
export async function readClipboard(): Promise<string> {
  return getClipboardy().read();
}

/**
 * Write text to the clipboard.
 * @param text The text to write to the clipboard
 * @throws If clipboardy module failed to load
 */
export async function writeClipboard(text: string): Promise<void> {
  return getClipboardy().write(text);
}

/**
 * Check if clipboard functionality is available.
 * @returns True if clipboard operations are available
 */
export function isClipboardAvailable(): boolean {
  return clipboardyModule !== undefined;
}
