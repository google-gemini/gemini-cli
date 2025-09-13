/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Key } from '../contexts/KeypressContext.js';

export type { Key };

/**
 * Translates a Key object into its corresponding ANSI escape sequence.
 * This is useful for sending control characters to a pseudo-terminal.
 *
 * @param key The Key object to translate.
 * @returns The ANSI escape sequence as a string, or null if no mapping exists.
 */
export function keyToAnsi(key: Key): string | null {
  if (key.ctrl) {
    // Ctrl + letter
    if (key.name >= 'a' && key.name <= 'z') {
      return String.fromCharCode(
        key.name.charCodeAt(0) - 'a'.charCodeAt(0) + 1,
      );
    }
    // Other Ctrl combinations might need specific handling
    switch (key.name) {
      case 'c':
        return '\x03'; // ETX (End of Text), commonly used for interrupt
      // Add other special ctrl cases if needed
      default:
        break;
    }
  }

  // Arrow keys and other special keys
  switch (key.name) {
    case 'up':
      return '\x1b[A';
    case 'down':
      return '\x1b[B';
    case 'right':
      return '\x1b[C';
    case 'left':
      return '\x1b[D';
    case 'escape':
      return '\x1b';
    case 'tab':
      return '\t';
    case 'backspace':
      return '\x7f';
    case 'delete':
      return '\x1b[3~';
    case 'home':
      return '\x1b[H';
    case 'end':
      return '\x1b[F';
    case 'pageup':
      return '\x1b[5~';
    case 'pagedown':
      return '\x1b[6~';
    default:
      break;
  }

  // Enter/Return
  if (key.name === 'return') {
    return '\r';
  }

  // If it's a simple character, return it.
  if (!key.ctrl && !key.meta && key.sequence) {
    return key.sequence;
  }

  return null;
}
