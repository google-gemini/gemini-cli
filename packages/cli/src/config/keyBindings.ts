/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command enum for all available keyboard shortcuts
 */
export enum Command {
  // Basic Controls
  RETURN = 'basic.confirm',
  ESCAPE = 'basic.cancel',
  QUIT = 'basic.quit',
  EXIT = 'basic.exit',

  // Cursor Movement
  HOME = 'cursor.home',
  END = 'cursor.end',
  MOVE_UP = 'cursor.up',
  MOVE_DOWN = 'cursor.down',
  MOVE_LEFT = 'cursor.left',
  MOVE_RIGHT = 'cursor.right',
  MOVE_WORD_LEFT = 'cursor.wordLeft',
  MOVE_WORD_RIGHT = 'cursor.wordRight',

  // Editing
  KILL_LINE_RIGHT = 'edit.deleteRightAll',
  KILL_LINE_LEFT = 'edit.deleteLeftAll',
  CLEAR_INPUT = 'edit.clear',
  DELETE_WORD_BACKWARD = 'edit.deleteWordLeft',
  DELETE_WORD_FORWARD = 'edit.deleteWordRight',
  DELETE_CHAR_LEFT = 'edit.deleteLeft',
  DELETE_CHAR_RIGHT = 'edit.deleteRight',
  UNDO = 'edit.undo',
  REDO = 'edit.redo',

  // Scrolling
  SCROLL_UP = 'scroll.up',
  SCROLL_DOWN = 'scroll.down',
  SCROLL_HOME = 'scroll.home',
  SCROLL_END = 'scroll.end',
  PAGE_UP = 'scroll.pageUp',
  PAGE_DOWN = 'scroll.pageDown',

  // History & Search
  HISTORY_UP = 'history.previous',
  HISTORY_DOWN = 'history.next',
  REVERSE_SEARCH = 'history.search.start',
  SUBMIT_REVERSE_SEARCH = 'history.search.submit',
  ACCEPT_SUGGESTION_REVERSE_SEARCH = 'history.search.accept',
  REWIND = 'history.rewind',

  // Navigation
  NAVIGATION_UP = 'nav.up',
  NAVIGATION_DOWN = 'nav.down',
  DIALOG_NAVIGATION_UP = 'nav.dialog.up',
  DIALOG_NAVIGATION_DOWN = 'nav.dialog.down',
  DIALOG_NEXT = 'nav.dialog.next',
  DIALOG_PREV = 'nav.dialog.previous',

  // Suggestions & Completions
  ACCEPT_SUGGESTION = 'suggest.accept',
  COMPLETION_UP = 'suggest.focusPrevious',
  COMPLETION_DOWN = 'suggest.focusNext',
  EXPAND_SUGGESTION = 'suggest.expand',
  COLLAPSE_SUGGESTION = 'suggest.collapse',

  // Text Input
  SUBMIT = 'input.submit',
  NEWLINE = 'input.newline',
  OPEN_EXTERNAL_EDITOR = 'input.openExternalEditor',
  PASTE_CLIPBOARD = 'input.paste',

  BACKGROUND_SHELL_ESCAPE = 'backgroundShellEscape',
  BACKGROUND_SHELL_SELECT = 'backgroundShellSelect',
  TOGGLE_BACKGROUND_SHELL = 'toggleBackgroundShell',
  TOGGLE_BACKGROUND_SHELL_LIST = 'toggleBackgroundShellList',
  KILL_BACKGROUND_SHELL = 'backgroundShell.kill',
  UNFOCUS_BACKGROUND_SHELL = 'backgroundShell.unfocus',
  UNFOCUS_BACKGROUND_SHELL_LIST = 'backgroundShell.listUnfocus',
  SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING = 'backgroundShell.unfocusWarning',
  SHOW_SHELL_INPUT_UNFOCUS_WARNING = 'shellInput.unfocusWarning',

  // App Controls
  SHOW_ERROR_DETAILS = 'app.showErrorDetails',
  SHOW_FULL_TODOS = 'app.showFullTodos',
  SHOW_IDE_CONTEXT_DETAIL = 'app.showIdeContextDetail',
  TOGGLE_MARKDOWN = 'app.toggleMarkdown',
  TOGGLE_COPY_MODE = 'app.toggleCopyMode',
  TOGGLE_YOLO = 'app.toggleYolo',
  CYCLE_APPROVAL_MODE = 'app.cycleApprovalMode',
  SHOW_MORE_LINES = 'app.showMoreLines',
  FOCUS_SHELL_INPUT = 'app.focusShellInput',
  UNFOCUS_SHELL_INPUT = 'app.unfocusShellInput',
  CLEAR_SCREEN = 'app.clearScreen',
  RESTART_APP = 'app.restart',
  SUSPEND_APP = 'app.suspend',
}

/**
 * Data-driven key binding structure for user configuration
 */
export interface KeyBinding {
  /** The key name (e.g., 'a', 'return', 'tab', 'escape') */
  key: string;
  /** Shift key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  shift?: boolean;
  /** Alt/Option key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  alt?: boolean;
  /** Control key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  ctrl?: boolean;
  /** Command/Windows/Super key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  cmd?: boolean;
}

/**
 * Configuration type mapping commands to their key bindings
 */
export type KeyBindingConfig = {
  readonly [C in Command]: readonly KeyBinding[];
};

/**
 * Default key binding configuration
 * Matches the original hard-coded logic exactly
 */
export const defaultKeyBindings: KeyBindingConfig = {
  // Basic Controls
  [Command.RETURN]: [{ key: 'return' }],
  [Command.ESCAPE]: [{ key: 'escape' }],
  [Command.QUIT]: [{ key: 'c', ctrl: true }],
  [Command.EXIT]: [{ key: 'd', ctrl: true }],

  // Cursor Movement
  [Command.HOME]: [
    { key: 'a', ctrl: true },
    { key: 'home', shift: false, ctrl: false },
  ],
  [Command.END]: [
    { key: 'e', ctrl: true },
    { key: 'end', shift: false, ctrl: false },
  ],
  [Command.MOVE_UP]: [
    { key: 'up', shift: false, alt: false, ctrl: false, cmd: false },
  ],
  [Command.MOVE_DOWN]: [
    { key: 'down', shift: false, alt: false, ctrl: false, cmd: false },
  ],
  [Command.MOVE_LEFT]: [
    { key: 'left', shift: false, alt: false, ctrl: false, cmd: false },
  ],
  [Command.MOVE_RIGHT]: [
    { key: 'right', shift: false, alt: false, ctrl: false, cmd: false },
    { key: 'f', ctrl: true },
  ],
  [Command.MOVE_WORD_LEFT]: [
    { key: 'left', ctrl: true },
    { key: 'left', alt: true },
    { key: 'b', alt: true },
  ],
  [Command.MOVE_WORD_RIGHT]: [
    { key: 'right', ctrl: true },
    { key: 'right', alt: true },
    { key: 'f', alt: true },
  ],

  // Editing
  [Command.KILL_LINE_RIGHT]: [{ key: 'k', ctrl: true }],
  [Command.KILL_LINE_LEFT]: [{ key: 'u', ctrl: true }],
  [Command.CLEAR_INPUT]: [{ key: 'c', ctrl: true }],
  [Command.DELETE_WORD_BACKWARD]: [
    { key: 'backspace', ctrl: true },
    { key: 'backspace', alt: true },
    { key: 'w', ctrl: true },
  ],
  [Command.DELETE_WORD_FORWARD]: [
    { key: 'delete', ctrl: true },
    { key: 'delete', alt: true },
  ],
  [Command.DELETE_CHAR_LEFT]: [{ key: 'backspace' }, { key: 'h', ctrl: true }],
  [Command.DELETE_CHAR_RIGHT]: [{ key: 'delete' }, { key: 'd', ctrl: true }],
  [Command.UNDO]: [
    { key: 'z', cmd: true, shift: false },
    { key: 'z', alt: true, shift: false },
  ],
  [Command.REDO]: [
    { key: 'z', ctrl: true, shift: true },
    { key: 'z', cmd: true, shift: true },
    { key: 'z', alt: true, shift: true },
  ],

  // Scrolling
  [Command.SCROLL_UP]: [{ key: 'up', shift: true }],
  [Command.SCROLL_DOWN]: [{ key: 'down', shift: true }],
  [Command.SCROLL_HOME]: [
    { key: 'home', ctrl: true },
    { key: 'home', shift: true },
  ],
  [Command.SCROLL_END]: [
    { key: 'end', ctrl: true },
    { key: 'end', shift: true },
  ],
  [Command.PAGE_UP]: [{ key: 'pageup' }],
  [Command.PAGE_DOWN]: [{ key: 'pagedown' }],

  // History & Search
  [Command.HISTORY_UP]: [{ key: 'p', shift: false, ctrl: true }],
  [Command.HISTORY_DOWN]: [{ key: 'n', shift: false, ctrl: true }],
  [Command.REVERSE_SEARCH]: [{ key: 'r', ctrl: true }],
  [Command.REWIND]: [{ key: 'double escape' }],
  [Command.SUBMIT_REVERSE_SEARCH]: [{ key: 'return', ctrl: false }],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [{ key: 'tab' }],

  // Navigation
  [Command.NAVIGATION_UP]: [{ key: 'up', shift: false }],
  [Command.NAVIGATION_DOWN]: [{ key: 'down', shift: false }],
  // Navigation shortcuts appropriate for dialogs where we do not need to accept
  // text input.
  [Command.DIALOG_NAVIGATION_UP]: [
    { key: 'up', shift: false },
    { key: 'k', shift: false },
  ],
  [Command.DIALOG_NAVIGATION_DOWN]: [
    { key: 'down', shift: false },
    { key: 'j', shift: false },
  ],
  [Command.DIALOG_NEXT]: [{ key: 'tab', shift: false }],
  [Command.DIALOG_PREV]: [{ key: 'tab', shift: true }],

  // Suggestions & Completions
  [Command.ACCEPT_SUGGESTION]: [{ key: 'tab' }, { key: 'return', ctrl: false }],
  [Command.COMPLETION_UP]: [
    { key: 'up', shift: false },
    { key: 'p', shift: false, ctrl: true },
  ],
  [Command.COMPLETION_DOWN]: [
    { key: 'down', shift: false },
    { key: 'n', shift: false, ctrl: true },
  ],
  [Command.EXPAND_SUGGESTION]: [{ key: 'right' }],
  [Command.COLLAPSE_SUGGESTION]: [{ key: 'left' }],

  // Text Input
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT]: [
    {
      key: 'return',
      shift: false,
      alt: false,
      ctrl: false,
      cmd: false,
    },
  ],
  [Command.NEWLINE]: [
    { key: 'return', ctrl: true },
    { key: 'return', cmd: true },
    { key: 'return', alt: true },
    { key: 'return', shift: true },
    { key: 'j', ctrl: true },
  ],
  [Command.OPEN_EXTERNAL_EDITOR]: [{ key: 'x', ctrl: true }],
  [Command.PASTE_CLIPBOARD]: [
    { key: 'v', ctrl: true },
    { key: 'v', cmd: true },
    { key: 'v', alt: true },
  ],

  // App Controls
  [Command.SHOW_ERROR_DETAILS]: [{ key: 'f12' }],
  [Command.SHOW_FULL_TODOS]: [{ key: 't', ctrl: true }],
  [Command.SHOW_IDE_CONTEXT_DETAIL]: [{ key: 'g', ctrl: true }],
  [Command.TOGGLE_MARKDOWN]: [{ key: 'm', alt: true }],
  [Command.TOGGLE_COPY_MODE]: [{ key: 's', ctrl: true }],
  [Command.TOGGLE_YOLO]: [{ key: 'y', ctrl: true }],
  [Command.CYCLE_APPROVAL_MODE]: [{ key: 'tab', shift: true }],
  [Command.TOGGLE_BACKGROUND_SHELL]: [{ key: 'b', ctrl: true }],
  [Command.TOGGLE_BACKGROUND_SHELL_LIST]: [{ key: 'l', ctrl: true }],
  [Command.KILL_BACKGROUND_SHELL]: [{ key: 'k', ctrl: true }],
  [Command.UNFOCUS_BACKGROUND_SHELL]: [{ key: 'tab', shift: true }],
  [Command.UNFOCUS_BACKGROUND_SHELL_LIST]: [{ key: 'tab', shift: false }],
  [Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING]: [
    { key: 'tab', shift: false },
  ],
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING]: [{ key: 'tab', shift: false }],
  [Command.BACKGROUND_SHELL_SELECT]: [{ key: 'return' }],
  [Command.BACKGROUND_SHELL_ESCAPE]: [{ key: 'escape' }],
  [Command.SHOW_MORE_LINES]: [
    { key: 'o', ctrl: true },
    { key: 's', ctrl: true },
  ],
  [Command.FOCUS_SHELL_INPUT]: [{ key: 'tab', shift: false }],
  [Command.UNFOCUS_SHELL_INPUT]: [{ key: 'tab', shift: true }],
  [Command.CLEAR_SCREEN]: [{ key: 'l', ctrl: true }],
  [Command.RESTART_APP]: [{ key: 'r' }],
  [Command.SUSPEND_APP]: [{ key: 'z', ctrl: true }],
};

interface CommandCategory {
  readonly title: string;
  readonly commands: readonly Command[];
}

/**
 * Presentation metadata for grouping commands in documentation or UI.
 */
export const commandCategories: readonly CommandCategory[] = [
  {
    title: 'Basic Controls',
    commands: [Command.RETURN, Command.ESCAPE, Command.QUIT, Command.EXIT],
  },
  {
    title: 'Cursor Movement',
    commands: [
      Command.HOME,
      Command.END,
      Command.MOVE_UP,
      Command.MOVE_DOWN,
      Command.MOVE_LEFT,
      Command.MOVE_RIGHT,
      Command.MOVE_WORD_LEFT,
      Command.MOVE_WORD_RIGHT,
    ],
  },
  {
    title: 'Editing',
    commands: [
      Command.KILL_LINE_RIGHT,
      Command.KILL_LINE_LEFT,
      Command.CLEAR_INPUT,
      Command.DELETE_WORD_BACKWARD,
      Command.DELETE_WORD_FORWARD,
      Command.DELETE_CHAR_LEFT,
      Command.DELETE_CHAR_RIGHT,
      Command.UNDO,
      Command.REDO,
    ],
  },
  {
    title: 'Scrolling',
    commands: [
      Command.SCROLL_UP,
      Command.SCROLL_DOWN,
      Command.SCROLL_HOME,
      Command.SCROLL_END,
      Command.PAGE_UP,
      Command.PAGE_DOWN,
    ],
  },
  {
    title: 'History & Search',
    commands: [
      Command.HISTORY_UP,
      Command.HISTORY_DOWN,
      Command.REVERSE_SEARCH,
      Command.SUBMIT_REVERSE_SEARCH,
      Command.ACCEPT_SUGGESTION_REVERSE_SEARCH,
      Command.REWIND,
    ],
  },
  {
    title: 'Navigation',
    commands: [
      Command.NAVIGATION_UP,
      Command.NAVIGATION_DOWN,
      Command.DIALOG_NAVIGATION_UP,
      Command.DIALOG_NAVIGATION_DOWN,
      Command.DIALOG_NEXT,
      Command.DIALOG_PREV,
    ],
  },
  {
    title: 'Suggestions & Completions',
    commands: [
      Command.ACCEPT_SUGGESTION,
      Command.COMPLETION_UP,
      Command.COMPLETION_DOWN,
      Command.EXPAND_SUGGESTION,
      Command.COLLAPSE_SUGGESTION,
    ],
  },
  {
    title: 'Text Input',
    commands: [
      Command.SUBMIT,
      Command.NEWLINE,
      Command.OPEN_EXTERNAL_EDITOR,
      Command.PASTE_CLIPBOARD,
    ],
  },
  {
    title: 'App Controls',
    commands: [
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
      Command.BACKGROUND_SHELL_SELECT,
      Command.BACKGROUND_SHELL_ESCAPE,
      Command.UNFOCUS_BACKGROUND_SHELL,
      Command.UNFOCUS_BACKGROUND_SHELL_LIST,
      Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING,
      Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING,
      Command.FOCUS_SHELL_INPUT,
      Command.UNFOCUS_SHELL_INPUT,
      Command.CLEAR_SCREEN,
      Command.RESTART_APP,
      Command.SUSPEND_APP,
    ],
  },
];

/**
 * Human-readable descriptions for each command, used in docs/tooling.
 */
export const commandDescriptions: Readonly<Record<Command, string>> = {
  // Basic Controls
  [Command.RETURN]: 'Confirm the current selection or choice.',
  [Command.ESCAPE]: 'Dismiss dialogs or cancel the current focus.',
  [Command.QUIT]:
    'Cancel the current request or quit the CLI when input is empty.',
  [Command.EXIT]: 'Exit the CLI when the input buffer is empty.',

  // Cursor Movement
  [Command.HOME]: 'Move the cursor to the start of the line.',
  [Command.END]: 'Move the cursor to the end of the line.',
  [Command.MOVE_UP]: 'Move the cursor up one line.',
  [Command.MOVE_DOWN]: 'Move the cursor down one line.',
  [Command.MOVE_LEFT]: 'Move the cursor one character to the left.',
  [Command.MOVE_RIGHT]: 'Move the cursor one character to the right.',
  [Command.MOVE_WORD_LEFT]: 'Move the cursor one word to the left.',
  [Command.MOVE_WORD_RIGHT]: 'Move the cursor one word to the right.',

  // Editing
  [Command.KILL_LINE_RIGHT]: 'Delete from the cursor to the end of the line.',
  [Command.KILL_LINE_LEFT]: 'Delete from the cursor to the start of the line.',
  [Command.CLEAR_INPUT]: 'Clear all text in the input field.',
  [Command.DELETE_WORD_BACKWARD]: 'Delete the previous word.',
  [Command.DELETE_WORD_FORWARD]: 'Delete the next word.',
  [Command.DELETE_CHAR_LEFT]: 'Delete the character to the left.',
  [Command.DELETE_CHAR_RIGHT]: 'Delete the character to the right.',
  [Command.UNDO]: 'Undo the most recent text edit.',
  [Command.REDO]: 'Redo the most recent undone text edit.',

  // Scrolling
  [Command.SCROLL_UP]: 'Scroll content up.',
  [Command.SCROLL_DOWN]: 'Scroll content down.',
  [Command.SCROLL_HOME]: 'Scroll to the top.',
  [Command.SCROLL_END]: 'Scroll to the bottom.',
  [Command.PAGE_UP]: 'Scroll up by one page.',
  [Command.PAGE_DOWN]: 'Scroll down by one page.',

  // History & Search
  [Command.HISTORY_UP]: 'Show the previous entry in history.',
  [Command.HISTORY_DOWN]: 'Show the next entry in history.',
  [Command.REVERSE_SEARCH]: 'Start reverse search through history.',
  [Command.SUBMIT_REVERSE_SEARCH]: 'Submit the selected reverse-search match.',
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]:
    'Accept a suggestion while reverse searching.',
  [Command.REWIND]: 'Browse and rewind previous interactions.',

  // Navigation
  [Command.NAVIGATION_UP]: 'Move selection up in lists.',
  [Command.NAVIGATION_DOWN]: 'Move selection down in lists.',
  [Command.DIALOG_NAVIGATION_UP]: 'Move up within dialog options.',
  [Command.DIALOG_NAVIGATION_DOWN]: 'Move down within dialog options.',
  [Command.DIALOG_NEXT]: 'Move to the next item or question in a dialog.',
  [Command.DIALOG_PREV]: 'Move to the previous item or question in a dialog.',

  // Suggestions & Completions
  [Command.ACCEPT_SUGGESTION]: 'Accept the inline suggestion.',
  [Command.COMPLETION_UP]: 'Move to the previous completion option.',
  [Command.COMPLETION_DOWN]: 'Move to the next completion option.',
  [Command.EXPAND_SUGGESTION]: 'Expand an inline suggestion.',
  [Command.COLLAPSE_SUGGESTION]: 'Collapse an inline suggestion.',

  // Text Input
  [Command.SUBMIT]: 'Submit the current prompt.',
  [Command.NEWLINE]: 'Insert a newline without submitting.',
  [Command.OPEN_EXTERNAL_EDITOR]:
    'Open the current prompt in an external editor.',
  [Command.PASTE_CLIPBOARD]: 'Paste from the clipboard.',

  // App Controls
  [Command.SHOW_ERROR_DETAILS]: 'Toggle detailed error information.',
  [Command.SHOW_FULL_TODOS]: 'Toggle the full TODO list.',
  [Command.SHOW_IDE_CONTEXT_DETAIL]: 'Show IDE context details.',
  [Command.TOGGLE_MARKDOWN]: 'Toggle Markdown rendering.',
  [Command.TOGGLE_COPY_MODE]: 'Toggle copy mode when in alternate buffer mode.',
  [Command.TOGGLE_YOLO]: 'Toggle YOLO (auto-approval) mode for tool calls.',
  [Command.CYCLE_APPROVAL_MODE]:
    'Cycle through approval modes: default (prompt), auto_edit (auto-approve edits), and plan (read-only).',
  [Command.SHOW_MORE_LINES]:
    'Expand a height-constrained response to show additional lines when not in alternate buffer mode.',
  [Command.BACKGROUND_SHELL_SELECT]:
    'Confirm selection in background shell list.',
  [Command.BACKGROUND_SHELL_ESCAPE]: 'Dismiss background shell list.',
  [Command.TOGGLE_BACKGROUND_SHELL]:
    'Toggle current background shell visibility.',
  [Command.TOGGLE_BACKGROUND_SHELL_LIST]: 'Toggle background shell list.',
  [Command.KILL_BACKGROUND_SHELL]: 'Kill the active background shell.',
  [Command.UNFOCUS_BACKGROUND_SHELL]:
    'Move focus from background shell to Gemini.',
  [Command.UNFOCUS_BACKGROUND_SHELL_LIST]:
    'Move focus from background shell list to Gemini.',
  [Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING]:
    'Show warning when trying to unfocus background shell via Tab.',
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING]:
    'Show warning when trying to unfocus shell input via Tab.',
  [Command.FOCUS_SHELL_INPUT]: 'Move focus from Gemini to the active shell.',
  [Command.UNFOCUS_SHELL_INPUT]: 'Move focus from the shell back to Gemini.',
  [Command.CLEAR_SCREEN]: 'Clear the terminal screen and redraw the UI.',
  [Command.RESTART_APP]: 'Restart the application.',
  [Command.SUSPEND_APP]: 'Suspend the application (not yet implemented).',
};
