/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hook that previously managed cursor shape changes based on vim mode using
 * terminal escape sequences (DECSCUSR).
 *
 * This approach doesn't work with Ink because Ink hides the terminal cursor
 * and renders its own "fake cursor" using chalk.inverse().
 *
 * Vim cursor shapes are now implemented in InputPrompt.tsx by modifying
 * Ink's cursor rendering directly:
 * - NORMAL mode: Block cursor (chalk.inverse)
 * - INSERT mode: Bar cursor (│ character)
 *
 * This hook is kept as a no-op for backward compatibility.
 */
export function useVimCursorShape() {
  // No-op: Cursor shape is now handled by InputPrompt.tsx
}
