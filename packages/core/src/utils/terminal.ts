/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeToStdout } from './stdio.js';

/**
 * ANSI escape codes for disabling mouse tracking.
 */
export function disableMouseTracking() {
  writeToStdout(
    [
      '\x1b[?1000l', // Normal tracking
      '\x1b[?1003l', // Any-event tracking
      '\x1b[?1015l', // urxvt extended mouse mode
      '\x1b[?1006l', // SGR-style mouse tracking
      '\x1b[?1002l', // Button-event tracking
    ].join(''),
  );
}

export function enableMouseEvents() {
  // Enable mouse tracking with SGR format
  // ?1002h = button event tracking (clicks + drags + scroll wheel)
  // ?1006h = SGR extended mouse mode (better coordinate handling)
  writeToStdout('\u001b[?1002h\u001b[?1006h');
}

export function disableMouseEvents() {
  // Disable mouse tracking with SGR format
  writeToStdout('\u001b[?1006l\u001b[?1002l');
}

export function enableKittyKeyboardProtocol() {
  writeToStdout('\x1b[>1u');
}

export function disableKittyKeyboardProtocol() {
  writeToStdout('\x1b[<u');
}

export function enableModifyOtherKeys() {
  writeToStdout('\x1b[>4;2m');
}

export function disableModifyOtherKeys() {
  writeToStdout('\x1b[>4;0m');
}

export function enableBracketedPasteMode() {
  writeToStdout('\x1b[?2004h');
}

export function disableBracketedPasteMode() {
  writeToStdout('\x1b[?2004l');
}

export function enableLineWrapping() {
  writeToStdout('\x1b[?7h');
}

export function disableLineWrapping() {
  writeToStdout('\x1b[?7l');
}

export function enterAlternateScreen() {
  writeToStdout('\x1b[?1049h');
}

export function exitAlternateScreen() {
  writeToStdout('\x1b[?1049l');
}

export function shouldEnterAlternateScreen(
  useAlternateBuffer: boolean,
  isScreenReader: boolean,
): boolean {
  return useAlternateBuffer && !isScreenReader;
}

/**
 * Whether terminal auto-wrap (DECAWM) should be turned off while the UI runs.
 *
 * It must be off in the alternate buffer. It is also turned off when the
 * terminal renders East Asian Ambiguous-width characters (box-drawing borders)
 * in two cells: Ink places the right border glyph in the last column, so a
 * two-cell glyph there would soft-wrap the row and leave stale copies of the
 * previous frame in scrollback on every render.
 */
export function shouldDisableLineWrapping(
  useAlternateBuffer: boolean,
  ambiguousCharactersWide: boolean,
): boolean {
  return useAlternateBuffer || ambiguousCharactersWide;
}
