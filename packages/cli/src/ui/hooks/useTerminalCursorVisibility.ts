/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useStdout } from 'ink';

// ANSI escape sequences for cursor visibility
const SHOW_CURSOR = '\x1b[?25h';
const HIDE_CURSOR = '\x1b[?25l';

/**
 * Hook to manage terminal cursor visibility for IME (Input Method Editor) support.
 *
 * When the terminal cursor is hidden (which is the default in Ink), the OS-level
 * IME cannot show its composition overlay at the correct position. This affects
 * all IME-based input methods (Korean, Chinese, Japanese, etc.) where intermediate
 * character composition steps need to be visible to the user.
 *
 * This hook shows the terminal cursor when the input field is focused, allowing
 * the IME to display its composition window at the cursor position. The cursor
 * is hidden again when the input loses focus.
 *
 * Note: Ink already positions the terminal cursor at the correct location via
 * `terminalCursorFocus` and `terminalCursorPosition` props on `<Text>` components.
 * This hook simply makes that cursor visible.
 *
 * @param visible - Whether the terminal cursor should be visible (typically when input is focused)
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/18868
 */
export function useTerminalCursorVisibility(visible: boolean): void {
  const { stdout } = useStdout();

  useEffect(() => {
    if (visible) {
      stdout.write(SHOW_CURSOR);
    } else {
      stdout.write(HIDE_CURSOR);
    }

    return () => {
      // Restore hidden cursor on cleanup to avoid leaving cursor visible
      // when the component unmounts
      stdout.write(HIDE_CURSOR);
    };
  }, [visible, stdout]);
}
