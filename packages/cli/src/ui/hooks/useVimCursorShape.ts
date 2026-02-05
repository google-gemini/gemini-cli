/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { useStdout } from 'ink';
import { useVimMode } from '../contexts/VimModeContext.js';
import { useSettings } from '../contexts/SettingsContext.js';

/**
 * ANSI escape sequences for cursor shapes using DECSCUSR (DEC Set Cursor Style).
 * Format: CSI Ps SP q where Ps is the cursor style parameter.
 *
 * Terminal Support:
 * - iTerm2: ✓
 * - Terminal.app: ✓
 * - Alacritty: ✓
 * - Kitty: ✓
 * - VTE-based terminals (GNOME Terminal, Terminator, etc.): ✓
 * - tmux: ✓ (passes through to terminal)
 * - screen: Limited
 * - Basic xterm: Version-dependent
 *
 * DECSCUSR Cursor Styles:
 * - Ps = 0 or omitted: Reset to default
 * - Ps = 1: Blinking block
 * - Ps = 2: Steady block (used for NORMAL mode)
 * - Ps = 3: Blinking underline
 * - Ps = 4: Steady underline
 * - Ps = 5: Blinking bar
 * - Ps = 6: Steady bar (used for INSERT mode)
 *
 * See: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_
 */
const CURSOR_RESET = '\x1b[0 q'; // Reset to terminal default
const CURSOR_STEADY_BLOCK = '\x1b[2 q';
const CURSOR_STEADY_BAR = '\x1b[6 q';

/**
 * Hook that manages cursor shape changes based on vim mode.
 * Changes cursor to a bar in INSERT mode and block in NORMAL mode.
 *
 * This provides visual feedback about the current vim mode, similar to
 * traditional vim editors.
 *
 * Requirements:
 * - Terminal must support DECSCUSR escape sequences
 * - `general.vimModeCursorShape` setting must be enabled
 * - Works automatically when vim mode is enabled
 */
export function useVimCursorShape() {
  const { stdout } = useStdout();
  const { vimEnabled, vimMode } = useVimMode();
  const { merged: settings } = useSettings();
  const enabled = settings.general.vimModeCursorShape;

  // Track if we've ever enabled the feature to know if we should restore on unmount
  const hasBeenEnabledRef = useRef(false);

  useEffect(() => {
    // Early return if the feature is disabled
    if (!enabled) return;

    // Mark that we've enabled the feature at least once
    if (!hasBeenEnabledRef.current) {
      hasBeenEnabledRef.current = true;
    }

    // Update cursor shape based on vim state
    if (vimEnabled) {
      if (vimMode === 'INSERT') {
        // Steady bar cursor for INSERT mode (like traditional vim)
        stdout.write(CURSOR_STEADY_BAR);
      } else {
        // Steady block cursor for NORMAL mode (default vim cursor)
        stdout.write(CURSOR_STEADY_BLOCK);
      }
    } else {
      // Reset to block cursor when vim mode is disabled while the setting is enabled
      stdout.write(CURSOR_STEADY_BLOCK);
    }

    // Cleanup function: reset cursor to terminal default when effect re-runs or component unmounts.
    // This ensures the cursor is restored to the user's original state when:
    // - The setting is disabled
    // - Vim mode changes (INSERT <-> NORMAL)
    // - Vim is enabled/disabled
    // - The component unmounts
    return () => {
      stdout.write(CURSOR_RESET);
    };
  }, [enabled, vimEnabled, vimMode, stdout]);

  // Final cleanup on unmount - reset to terminal default cursor
  // This only runs once when the component unmounts
  useEffect(
    () => () => {
      // Only reset if we've ever enabled the feature
      if (hasBeenEnabledRef.current) {
        stdout.write(CURSOR_RESET);
      }
    },
    [stdout],
  );
}
