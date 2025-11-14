/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * Native text selection support for alternate buffer mode.
 * 
 * When mouse events are enabled in the terminal (for scroll wheel support),
 * native text selection is disabled. This module provides a solution to
 * allow users to copy text using Ctrl+C/Cmd+C without requiring a special
 * copy mode (Ctrl+S).
 * 
 * The approach is to temporarily disable mouse events when Ctrl+C is detected,
 * allowing the terminal's native copy mechanism to work, then re-enable mouse
 * events after a brief delay.
 */

/**
 * Temporarily disable mouse events to allow native terminal selection and copy.
 */
export function temporarilyDisableMouseForCopy(): void {
  // Disable mouse tracking
  process.stdout.write('\u001b[?1002l\u001b[?1006l');
  debugLogger.log('[Selection] Mouse events temporarily disabled for copy');
}

/**
 * Re-enable mouse events after copy operation completes.
 */
export function reEnableMouseAfterCopy(): void {
  // Re-enable mouse tracking with SGR format
  process.stdout.write('\u001b[?1002h\u001b[?1006h');
  debugLogger.log('[Selection] Mouse events re-enabled');
}

let copyHandlerTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Handle Ctrl+C/Cmd+C key press to enable native text copying.
 * 
 * This temporarily disables mouse events, waits for the terminal to process
 * the copy operation, then re-enables mouse events.
 * 
 * @returns true if the copy handling was initiated, false if already in progress
 */
export function handleCopyKeyPress(): boolean {
  // If we're already handling a copy, don't start another
  if (copyHandlerTimeout) {
    return false;
  }

  debugLogger.log('[Selection] Ctrl+C detected, initiating native copy support');
  
  // Disable mouse events to allow terminal's native copy
  temporarilyDisableMouseForCopy();
  
  // Re-enable after a short delay to allow the copy operation to complete
  // 200ms should be sufficient for most terminals to process the Ctrl+C
  copyHandlerTimeout = setTimeout(() => {
    reEnableMouseAfterCopy();
    copyHandlerTimeout = null;
  }, 200);

  return true;
}

/**
 * Cancel any pending copy handler timeout.
 * Used when exiting or changing modes.
 */
export function cancelCopyHandler(): void {
  if (copyHandlerTimeout) {
    clearTimeout(copyHandlerTimeout);
    copyHandlerTimeout = null;
    // Make sure mouse events are re-enabled
    reEnableMouseAfterCopy();
  }
}

/**
 * Check if a copy operation is currently being handled.
 */
export function isCopyInProgress(): boolean {
  return copyHandlerTimeout !== null;
}
