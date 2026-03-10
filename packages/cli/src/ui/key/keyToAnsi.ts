/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from '../contexts/KeypressContext.js';

export type { Key };

const SPECIAL_KEYS: Record<string, string> = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  escape: '\x1b',
  tab: '\t',
  backspace: '\x7f',
  delete: '\x1b[3~',
  home: '\x1b[H',
  end: '\x1b[F',
  pageup: '\x1b[5~',
  pagedown: '\x1b[6~',
  return: '\r',
};

/**
 * Translates a Key object into its corresponding ANSI escape sequence.
 * This is useful for sending control characters to a pseudo-terminal.
 *
 * @param key The Key object to translate.
 * @returns The ANSI escape sequence as a string, or null if no mapping exists.
 */
export function keyToAnsi(key: Key): string | null {
  if (key.ctrl) {
    // Ctrl + letter (A-Z maps to 1-26, e.g., Ctrl+C is \x03)
    if (key.name >= 'a' && key.name <= 'z') {
      return String.fromCharCode(
        key.name.charCodeAt(0) - 'a'.charCodeAt(0) + 1,
      );
    }
  }

  // Arrow keys and other special keys
  if (key.name in SPECIAL_KEYS) {
    return SPECIAL_KEYS[key.name];
  }

  // If it's a simple character, return it.
  if (!key.ctrl && !key.cmd && key.sequence) {
    return key.sequence;
  }

  return null;
}
