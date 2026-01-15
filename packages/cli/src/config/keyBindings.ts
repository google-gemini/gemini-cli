/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command enum for all available keyboard shortcuts
 */
export enum Command {
  // Basic bindings
  RETURN = 'return',
  ESCAPE = 'escape',

  // Cursor movement
  HOME = 'home',
  END = 'end',

  // Text deletion
  KILL_LINE_RIGHT = 'killLineRight',
  KILL_LINE_LEFT = 'killLineLeft',
  CLEAR_INPUT = 'clearInput',
  DELETE_WORD_BACKWARD = 'deleteWordBackward',

  // Screen control
  CLEAR_SCREEN = 'clearScreen',

  // Scrolling
  SCROLL_UP = 'scrollUp',
  SCROLL_DOWN = 'scrollDown',
  SCROLL_HOME = 'scrollHome',
  SCROLL_END = 'scrollEnd',
  PAGE_UP = 'pageUp',
  PAGE_DOWN = 'pageDown',

  // History navigation
  HISTORY_UP = 'historyUp',
  HISTORY_DOWN = 'historyDown',
  NAVIGATION_UP = 'navigationUp',
  NAVIGATION_DOWN = 'navigationDown',

  // Dialog navigation
  DIALOG_NAVIGATION_UP = 'dialogNavigationUp',
  DIALOG_NAVIGATION_DOWN = 'dialogNavigationDown',

  // Auto-completion
  ACCEPT_SUGGESTION = 'acceptSuggestion',
  COMPLETION_UP = 'completionUp',
  COMPLETION_DOWN = 'completionDown',

  // Text input
  SUBMIT = 'submit',
  NEWLINE = 'newline',

  // External tools
  OPEN_EXTERNAL_EDITOR = 'openExternalEditor',
  PASTE_CLIPBOARD = 'pasteClipboard',

  // App level bindings
  SHOW_ERROR_DETAILS = 'showErrorDetails',
  SHOW_FULL_TODOS = 'showFullTodos',
  SHOW_IDE_CONTEXT_DETAIL = 'showIDEContextDetail',
  TOGGLE_MARKDOWN = 'toggleMarkdown',
  TOGGLE_COPY_MODE = 'toggleCopyMode',
  TOGGLE_YOLO = 'toggleYolo',
  TOGGLE_AUTO_EDIT = 'toggleAutoEdit',
  UNDO = 'undo',
  REDO = 'redo',
  MOVE_UP = 'moveUp',
  MOVE_DOWN = 'moveDown',
  MOVE_LEFT = 'moveLeft',
  MOVE_RIGHT = 'moveRight',
  MOVE_WORD_LEFT = 'moveWordLeft',
  MOVE_WORD_RIGHT = 'moveWordRight',
  DELETE_CHAR_LEFT = 'deleteCharLeft',
  DELETE_CHAR_RIGHT = 'deleteCharRight',
  DELETE_WORD_FORWARD = 'deleteWordForward',
  QUIT = 'quit',
  EXIT = 'exit',
  SHOW_MORE_LINES = 'showMoreLines',

  // Shell commands
  REVERSE_SEARCH = 'reverseSearch',
  SUBMIT_REVERSE_SEARCH = 'submitReverseSearch',
  ACCEPT_SUGGESTION_REVERSE_SEARCH = 'acceptSuggestionReverseSearch',
  FOCUS_SHELL_INPUT = 'focusShellInput',
  UNFOCUS_SHELL_INPUT = 'unfocusShellInput',

  // Suggestion expansion
  EXPAND_SUGGESTION = 'expandSuggestion',
  COLLAPSE_SUGGESTION = 'collapseSuggestion',
}

/**
 * Data-driven key binding structure for user configuration
 */
export interface KeyBinding {
  /** The key name (e.g., 'a', 'return', 'tab', 'escape') */
  key: string;
  /** Control key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  ctrl?: boolean;
  /** Shift key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  shift?: boolean;
  /** Command/meta key requirement: true=must be pressed, false=must not be pressed, undefined=ignore */
  command?: boolean;
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
  // Basic bindings
  [Command.RETURN]: [{ key: 'return' }],
  [Command.ESCAPE]: [{ key: 'escape' }],

  // Cursor movement
  [Command.HOME]: [{ key: 'a', ctrl: true }, { key: 'home' }],
  [Command.END]: [{ key: 'e', ctrl: true }, { key: 'end' }],

  // Text deletion
  [Command.KILL_LINE_RIGHT]: [{ key: 'k', ctrl: true }],
  [Command.KILL_LINE_LEFT]: [{ key: 'u', ctrl: true }],
  [Command.CLEAR_INPUT]: [{ key: 'c', ctrl: true }],
  // Added command (meta/alt/option) for mac compatibility
  [Command.DELETE_WORD_BACKWARD]: [
    { key: 'backspace', ctrl: true },
    { key: 'backspace', command: true },
    { key: 'w', ctrl: true },
  ],
  [Command.MOVE_LEFT]: [
    { key: 'left', ctrl: false, command: false },
    { key: 'b', ctrl: true },
  ],
  [Command.MOVE_RIGHT]: [
    { key: 'right', ctrl: false, command: false },
    { key: 'f', ctrl: true },
  ],
  [Command.MOVE_UP]: [{ key: 'up', ctrl: false, command: false }],
  [Command.MOVE_DOWN]: [{ key: 'down', ctrl: false, command: false }],
  [Command.MOVE_WORD_LEFT]: [
    { key: 'left', ctrl: true },
    { key: 'left', command: true },
    { key: 'b', command: true },
  ],
  [Command.MOVE_WORD_RIGHT]: [
    { key: 'right', ctrl: true },
    { key: 'right', command: true },
    { key: 'f', command: true },
  ],
  [Command.DELETE_CHAR_LEFT]: [{ key: 'backspace' }, { key: 'h', ctrl: true }],
  [Command.DELETE_CHAR_RIGHT]: [{ key: 'delete' }, { key: 'd', ctrl: true }],
  [Command.DELETE_WORD_FORWARD]: [
    { key: 'delete', ctrl: true },
    { key: 'delete', command: true },
  ],

  // Screen control
  [Command.CLEAR_SCREEN]: [{ key: 'l', ctrl: true }],

  // Scrolling
  [Command.SCROLL_UP]: [{ key: 'up', shift: true }],
  [Command.SCROLL_DOWN]: [{ key: 'down', shift: true }],
  [Command.SCROLL_HOME]: [{ key: 'home' }],
  [Command.SCROLL_END]: [{ key: 'end' }],
  [Command.PAGE_UP]: [{ key: 'pageup' }],
  [Command.PAGE_DOWN]: [{ key: 'pagedown' }],

  // History navigation
  [Command.HISTORY_UP]: [{ key: 'p', ctrl: true, shift: false }],
  [Command.HISTORY_DOWN]: [{ key: 'n', ctrl: true, shift: false }],
  [Command.NAVIGATION_UP]: [{ key: 'up', shift: false }],
  [Command.NAVIGATION_DOWN]: [{ key: 'down', shift: false }],

  // Dialog navigation
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

  // Auto-completion
  [Command.ACCEPT_SUGGESTION]: [{ key: 'tab' }, { key: 'return', ctrl: false }],
  // Completion navigation (arrow or Ctrl+P/N)
  [Command.COMPLETION_UP]: [
    { key: 'up', shift: false },
    { key: 'p', ctrl: true, shift: false },
  ],
  [Command.COMPLETION_DOWN]: [
    { key: 'down', shift: false },
    { key: 'n', ctrl: true, shift: false },
  ],

  // Text input
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT]: [
    {
      key: 'return',
      ctrl: false,
      command: false,
      shift: false,
    },
  ],
  // Split into multiple data-driven bindings
  // Now also includes shift+enter for multi-line input
  [Command.NEWLINE]: [
    { key: 'return', ctrl: true },
    { key: 'return', command: true },
    { key: 'return', shift: true },
    { key: 'j', ctrl: true },
  ],

  // External tools
  [Command.OPEN_EXTERNAL_EDITOR]: [{ key: 'x', ctrl: true }],
  [Command.PASTE_CLIPBOARD]: [
    { key: 'v', ctrl: true },
    { key: 'v', command: true },
  ],

  // App level bindings
  [Command.SHOW_ERROR_DETAILS]: [{ key: 'f12' }],
  [Command.SHOW_FULL_TODOS]: [{ key: 't', ctrl: true }],
  [Command.SHOW_IDE_CONTEXT_DETAIL]: [{ key: 'g', ctrl: true }],
  [Command.TOGGLE_MARKDOWN]: [{ key: 'm', command: true }],
  [Command.TOGGLE_COPY_MODE]: [{ key: 's', ctrl: true }],
  [Command.TOGGLE_YOLO]: [{ key: 'y', ctrl: true }],
  [Command.TOGGLE_AUTO_EDIT]: [{ key: 'tab', shift: true }],
  [Command.UNDO]: [{ key: 'z', ctrl: true, shift: false }],
  [Command.REDO]: [{ key: 'z', ctrl: true, shift: true }],
  [Command.QUIT]: [{ key: 'c', ctrl: true }],
  [Command.EXIT]: [{ key: 'd', ctrl: true }],
  [Command.SHOW_MORE_LINES]: [{ key: 's', ctrl: true }],

  // Shell commands
  [Command.REVERSE_SEARCH]: [{ key: 'r', ctrl: true }],
  // Note: original logic ONLY checked ctrl=false, ignored meta/shift/paste
  [Command.SUBMIT_REVERSE_SEARCH]: [{ key: 'return', ctrl: false }],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [{ key: 'tab' }],
  [Command.FOCUS_SHELL_INPUT]: [{ key: 'tab', shift: false }],
  [Command.UNFOCUS_SHELL_INPUT]: [{ key: 'tab' }],
  // Suggestion expansion
  [Command.EXPAND_SUGGESTION]: [{ key: 'right' }],
  [Command.COLLAPSE_SUGGESTION]: [{ key: 'left' }],
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
    commands: [Command.RETURN, Command.ESCAPE],
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
    title: 'Screen Control',
    commands: [Command.CLEAR_SCREEN],
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
    ],
  },
  {
    title: 'Navigation',
    commands: [
      Command.NAVIGATION_UP,
      Command.NAVIGATION_DOWN,
      Command.DIALOG_NAVIGATION_UP,
      Command.DIALOG_NAVIGATION_DOWN,
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
    commands: [Command.SUBMIT, Command.NEWLINE],
  },
  {
    title: 'External Tools',
    commands: [Command.OPEN_EXTERNAL_EDITOR, Command.PASTE_CLIPBOARD],
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
      Command.TOGGLE_AUTO_EDIT,
      Command.SHOW_MORE_LINES,
      Command.FOCUS_SHELL_INPUT,
      Command.UNFOCUS_SHELL_INPUT,
    ],
  },
  {
    title: 'Session Control',
    commands: [Command.QUIT, Command.EXIT],
  },
];

/**
 * Human-readable descriptions for each command, used in docs/tooling.
 */
export const commandDescriptions: Readonly<Record<Command, string>> = {
  [Command.RETURN]: 'Confirm the current selection or choice.',
  [Command.ESCAPE]: 'Dismiss dialogs or cancel the current focus.',
  [Command.HOME]: 'Move the cursor to the start of the line.',
  [Command.END]: 'Move the cursor to the end of the line.',
  [Command.MOVE_LEFT]: 'Move the cursor one character to the left.',
  [Command.MOVE_RIGHT]: 'Move the cursor one character to the right.',
  [Command.MOVE_UP]: 'Move the cursor up one line.',
  [Command.MOVE_DOWN]: 'Move the cursor down one line.',
  [Command.MOVE_WORD_LEFT]: 'Move the cursor one word to the left.',
  [Command.MOVE_WORD_RIGHT]: 'Move the cursor one word to the right.',
  [Command.KILL_LINE_RIGHT]: 'Delete from the cursor to the end of the line.',
  [Command.KILL_LINE_LEFT]: 'Delete from the cursor to the start of the line.',
  [Command.CLEAR_INPUT]: 'Clear all text in the input field.',
  [Command.DELETE_WORD_BACKWARD]: 'Delete the previous word.',
  [Command.DELETE_WORD_FORWARD]: 'Delete the next word.',
  [Command.DELETE_CHAR_LEFT]: 'Delete the character to the left.',
  [Command.DELETE_CHAR_RIGHT]: 'Delete the character to the right.',
  [Command.UNDO]: 'Undo the most recent text edit.',
  [Command.REDO]: 'Redo the most recent undone text edit.',
  [Command.CLEAR_SCREEN]: 'Clear the terminal screen and redraw the UI.',
  [Command.SCROLL_UP]: 'Scroll content up.',
  [Command.SCROLL_DOWN]: 'Scroll content down.',
  [Command.SCROLL_HOME]: 'Scroll to the top.',
  [Command.SCROLL_END]: 'Scroll to the bottom.',
  [Command.PAGE_UP]: 'Scroll up by one page.',
  [Command.PAGE_DOWN]: 'Scroll down by one page.',
  [Command.HISTORY_UP]: 'Show the previous entry in history.',
  [Command.HISTORY_DOWN]: 'Show the next entry in history.',
  [Command.NAVIGATION_UP]: 'Move selection up in lists.',
  [Command.NAVIGATION_DOWN]: 'Move selection down in lists.',
  [Command.DIALOG_NAVIGATION_UP]: 'Move up within dialog options.',
  [Command.DIALOG_NAVIGATION_DOWN]: 'Move down within dialog options.',
  [Command.ACCEPT_SUGGESTION]: 'Accept the inline suggestion.',
  [Command.COMPLETION_UP]: 'Move to the previous completion option.',
  [Command.COMPLETION_DOWN]: 'Move to the next completion option.',
  [Command.SUBMIT]: 'Submit the current prompt.',
  [Command.NEWLINE]: 'Insert a newline without submitting.',
  [Command.OPEN_EXTERNAL_EDITOR]:
    'Open the current prompt in an external editor.',
  [Command.PASTE_CLIPBOARD]: 'Paste from the clipboard.',
  [Command.SHOW_ERROR_DETAILS]: 'Toggle detailed error information.',
  [Command.SHOW_FULL_TODOS]: 'Toggle the full TODO list.',
  [Command.SHOW_IDE_CONTEXT_DETAIL]: 'Show IDE context details.',
  [Command.TOGGLE_MARKDOWN]: 'Toggle Markdown rendering.',
  [Command.TOGGLE_COPY_MODE]:
    'Toggle copy mode when the terminal is using the alternate buffer.',
  [Command.TOGGLE_YOLO]: 'Toggle YOLO (auto-approval) mode for tool calls.',
  [Command.TOGGLE_AUTO_EDIT]: 'Toggle Auto Edit (auto-accept edits) mode.',
  [Command.QUIT]: 'Cancel the current request or quit the CLI.',
  [Command.EXIT]: 'Exit the CLI when the input buffer is empty.',
  [Command.SHOW_MORE_LINES]:
    'Expand a height-constrained response to show additional lines.',
  [Command.REVERSE_SEARCH]: 'Start reverse search through history.',
  [Command.SUBMIT_REVERSE_SEARCH]: 'Submit the selected reverse-search match.',
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]:
    'Accept a suggestion while reverse searching.',
  [Command.FOCUS_SHELL_INPUT]: 'Focus the shell input from the gemini input.',
  [Command.UNFOCUS_SHELL_INPUT]: 'Focus the Gemini input from the shell input.',
  [Command.EXPAND_SUGGESTION]: 'Expand an inline suggestion.',
  [Command.COLLAPSE_SUGGESTION]: 'Collapse an inline suggestion.',
};
