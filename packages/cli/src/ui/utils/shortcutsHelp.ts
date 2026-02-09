/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, keyMatchers } from '../keyMatchers.js';
import type { Key } from '../hooks/useKeypress.js';

const SHORTCUTS_HELP_DISMISS_HOTKEYS: readonly Command[] = [
  Command.QUIT,
  Command.EXIT,
  Command.HISTORY_UP,
  Command.HISTORY_DOWN,
  Command.REVERSE_SEARCH,
  Command.OPEN_EXTERNAL_EDITOR,
  Command.UNDO,
  Command.REDO,
  Command.SHOW_ERROR_DETAILS,
  Command.SHOW_FULL_TODOS,
  Command.SHOW_IDE_CONTEXT_DETAIL,
  Command.TOGGLE_MARKDOWN,
  Command.TOGGLE_COPY_MODE,
  Command.TOGGLE_YOLO,
  Command.CYCLE_APPROVAL_MODE,
  Command.SHOW_MORE_LINES,
  Command.TOGGLE_BACKGROUND_SHELL,
  Command.TOGGLE_BACKGROUND_SHELL_LIST,
  Command.KILL_BACKGROUND_SHELL,
  Command.CLEAR_SCREEN,
  Command.SUSPEND_APP,
];

export function shouldDismissShortcutsHelpOnHotkey(key: Key): boolean {
  return SHORTCUTS_HELP_DISMISS_HOTKEYS.some((command) =>
    keyMatchers[command](key),
  );
}
