/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeToStdout } from './stdio.js';

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
 * OSC 8 Terminal Hyperlink Support
 *
 * OSC 8 is a terminal escape sequence standard for clickable hyperlinks.
 * Format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
 *
 * This allows the URL to be:
 * 1. Clickable in supporting terminals (iTerm2, Windows Terminal, GNOME Terminal, etc.)
 * 2. Copied as a complete URL when selected, even if the display text wraps
 * 3. Displayed with friendly text instead of the full URL
 *
 * For terminals that don't support OSC 8, only the display text is shown,
 * which is why we include the full URL as fallback text.
 */

/**
 * Creates an OSC 8 hyperlink escape sequence.
 * The hyperlink will be clickable in supporting terminals.
 *
 * @param url - The URL to link to
 * @param displayText - The text to display (defaults to the URL itself)
 * @returns The formatted hyperlink string with escape sequences
 */
export function formatHyperlink(url: string, displayText?: string): string {
  const text = displayText ?? url;
  // OSC 8 format: \x1b]8;;URL\x07TEXT\x1b]8;;\x07
  // \x1b]8;; - Start hyperlink (OSC 8)
  // URL - The target URL
  // \x07 - String terminator (BEL)
  // TEXT - Display text
  // \x1b]8;;\x07 - End hyperlink
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/**
 * Formats a URL for display in the terminal with both hyperlink support
 * and a plain-text fallback for copying.
 *
 * This function addresses the issue where long URLs wrap across terminal lines,
 * and characters at line-break boundaries can be lost when copying.
 *
 * The output includes:
 * 1. A clickable hyperlink (for terminals that support OSC 8)
 * 2. The full URL in plain text (for manual copying)
 *
 * @param url - The URL to format
 * @param label - Optional label for the hyperlink (defaults to "Click here" or similar)
 * @returns Formatted string with hyperlink and plain URL
 */
export function formatClickableUrl(url: string, label?: string): string {
  const linkText = label ?? '🔗 Click here to open';
  const hyperlink = formatHyperlink(url, linkText);

  return `${hyperlink}

Or copy this URL (select all, then copy):
${url}`;
}
