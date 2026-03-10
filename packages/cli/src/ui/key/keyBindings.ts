/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command enum for all available keyboard shortcuts
 */
import type { Key } from '../hooks/useKeypress.js';

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
  EXPAND_PASTE = 'app.expandPaste',
  FOCUS_SHELL_INPUT = 'app.focusShellInput',
  UNFOCUS_SHELL_INPUT = 'app.unfocusShellInput',
  CLEAR_SCREEN = 'app.clearScreen',
  RESTART_APP = 'app.restart',
  SUSPEND_APP = 'app.suspend',
}

/**
 * Data-driven key binding structure for user configuration
 */
export class KeyBinding {
  private static readonly VALID_KEYS = new Set([
    // Letters & Numbers
    ...'abcdefghijklmnopqrstuvwxyz0123456789',
    // Punctuation
    '`',
    '-',
    '=',
    '[',
    ']',
    '\\',
    ';',
    "'",
    ',',
    '.',
    '/',
    // Navigation & Actions
    'left',
    'up',
    'right',
    'down',
    'pageup',
    'pagedown',
    'end',
    'home',
    'tab',
    'enter',
    'escape',
    'space',
    'backspace',
    'delete',
    'pausebreak',
    'capslock',
    'insert',
    'numlock',
    'scrolllock',
    // Function Keys
    ...Array.from({ length: 19 }, (_, i) => `f${i + 1}`),
    // Numpad
    ...Array.from({ length: 10 }, (_, i) => `numpad${i}`),
    'numpad_multiply',
    'numpad_add',
    'numpad_separator',
    'numpad_subtract',
    'numpad_decimal',
    'numpad_divide',
    // Gemini CLI legacy/internal support
    'return',
  ]);

  /** The key name (e.g., 'a', 'return', 'tab', 'escape') */
  readonly key: string;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly cmd: boolean;

  constructor(pattern: string) {
    let remains = pattern.toLowerCase().trim();
    let shift = false;
    let alt = false;
    let ctrl = false;
    let cmd = false;

    let matched: boolean;
    do {
      matched = false;
      if (remains.startsWith('ctrl+')) {
        ctrl = true;
        remains = remains.slice(5);
        matched = true;
      } else if (remains.startsWith('shift+')) {
        shift = true;
        remains = remains.slice(6);
        matched = true;
      } else if (remains.startsWith('alt+')) {
        alt = true;
        remains = remains.slice(4);
        matched = true;
      } else if (remains.startsWith('option+')) {
        alt = true;
        remains = remains.slice(7);
        matched = true;
      } else if (remains.startsWith('opt+')) {
        alt = true;
        remains = remains.slice(4);
        matched = true;
      } else if (remains.startsWith('cmd+')) {
        cmd = true;
        remains = remains.slice(4);
        matched = true;
      } else if (remains.startsWith('meta+')) {
        cmd = true;
        remains = remains.slice(5);
        matched = true;
      }
    } while (matched);

    const key = remains;

    if (!KeyBinding.VALID_KEYS.has(key)) {
      throw new Error(`Invalid keybinding key: "${key}" in "${pattern}"`);
    }

    this.key = key;
    this.shift = shift;
    this.alt = alt;
    this.ctrl = ctrl;
    this.cmd = cmd;
  }

  matches(key: Key): boolean {
    return (
      this.key === key.name &&
      !!key.shift === !!this.shift &&
      !!key.alt === !!this.alt &&
      !!key.ctrl === !!this.ctrl &&
      !!key.cmd === !!this.cmd
    );
  }
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
  [Command.RETURN]: [new KeyBinding('return')],
  [Command.ESCAPE]: [new KeyBinding('escape'), new KeyBinding('ctrl+[')],
  [Command.QUIT]: [new KeyBinding('ctrl+c')],
  [Command.EXIT]: [new KeyBinding('ctrl+d')],

  // Cursor Movement
  [Command.HOME]: [new KeyBinding('ctrl+a'), new KeyBinding('home')],
  [Command.END]: [new KeyBinding('ctrl+e'), new KeyBinding('end')],
  [Command.MOVE_UP]: [new KeyBinding('up')],
  [Command.MOVE_DOWN]: [new KeyBinding('down')],
  [Command.MOVE_LEFT]: [new KeyBinding('left')],
  [Command.MOVE_RIGHT]: [new KeyBinding('right'), new KeyBinding('ctrl+f')],
  [Command.MOVE_WORD_LEFT]: [
    new KeyBinding('ctrl+left'),
    new KeyBinding('alt+left'),
    new KeyBinding('alt+b'),
  ],
  [Command.MOVE_WORD_RIGHT]: [
    new KeyBinding('ctrl+right'),
    new KeyBinding('alt+right'),
    new KeyBinding('alt+f'),
  ],

  // Editing
  [Command.KILL_LINE_RIGHT]: [new KeyBinding('ctrl+k')],
  [Command.KILL_LINE_LEFT]: [new KeyBinding('ctrl+u')],
  [Command.CLEAR_INPUT]: [new KeyBinding('ctrl+c')],
  [Command.DELETE_WORD_BACKWARD]: [
    new KeyBinding('ctrl+backspace'),
    new KeyBinding('alt+backspace'),
    new KeyBinding('ctrl+w'),
  ],
  [Command.DELETE_WORD_FORWARD]: [
    new KeyBinding('ctrl+delete'),
    new KeyBinding('alt+delete'),
    new KeyBinding('alt+d'),
  ],
  [Command.DELETE_CHAR_LEFT]: [
    new KeyBinding('backspace'),
    new KeyBinding('ctrl+h'),
  ],
  [Command.DELETE_CHAR_RIGHT]: [
    new KeyBinding('delete'),
    new KeyBinding('ctrl+d'),
  ],
  [Command.UNDO]: [new KeyBinding('cmd+z'), new KeyBinding('alt+z')],
  [Command.REDO]: [
    new KeyBinding('ctrl+shift+z'),
    new KeyBinding('cmd+shift+z'),
    new KeyBinding('alt+shift+z'),
  ],

  // Scrolling
  [Command.SCROLL_UP]: [new KeyBinding('shift+up')],
  [Command.SCROLL_DOWN]: [new KeyBinding('shift+down')],
  [Command.SCROLL_HOME]: [
    new KeyBinding('ctrl+home'),
    new KeyBinding('shift+home'),
  ],
  [Command.SCROLL_END]: [
    new KeyBinding('ctrl+end'),
    new KeyBinding('shift+end'),
  ],
  [Command.PAGE_UP]: [new KeyBinding('pageup')],
  [Command.PAGE_DOWN]: [new KeyBinding('pagedown')],

  // History & Search
  [Command.HISTORY_UP]: [new KeyBinding('ctrl+p')],
  [Command.HISTORY_DOWN]: [new KeyBinding('ctrl+n')],
  [Command.REVERSE_SEARCH]: [new KeyBinding('ctrl+r')],
  [Command.SUBMIT_REVERSE_SEARCH]: [new KeyBinding('return')],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]: [new KeyBinding('tab')],

  // Navigation
  [Command.NAVIGATION_UP]: [new KeyBinding('up')],
  [Command.NAVIGATION_DOWN]: [new KeyBinding('down')],
  // Navigation shortcuts appropriate for dialogs where we do not need to accept
  // text input.
  [Command.DIALOG_NAVIGATION_UP]: [new KeyBinding('up'), new KeyBinding('k')],
  [Command.DIALOG_NAVIGATION_DOWN]: [
    new KeyBinding('down'),
    new KeyBinding('j'),
  ],
  [Command.DIALOG_NEXT]: [new KeyBinding('tab')],
  [Command.DIALOG_PREV]: [new KeyBinding('shift+tab')],

  // Suggestions & Completions
  [Command.ACCEPT_SUGGESTION]: [
    new KeyBinding('tab'),
    new KeyBinding('return'),
  ],
  [Command.COMPLETION_UP]: [new KeyBinding('up'), new KeyBinding('ctrl+p')],
  [Command.COMPLETION_DOWN]: [new KeyBinding('down'), new KeyBinding('ctrl+n')],
  [Command.EXPAND_SUGGESTION]: [new KeyBinding('right')],
  [Command.COLLAPSE_SUGGESTION]: [new KeyBinding('left')],

  // Text Input
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT]: [new KeyBinding('return')],
  [Command.NEWLINE]: [
    new KeyBinding('ctrl+return'),
    new KeyBinding('cmd+return'),
    new KeyBinding('alt+return'),
    new KeyBinding('shift+return'),
    new KeyBinding('ctrl+j'),
  ],
  [Command.OPEN_EXTERNAL_EDITOR]: [new KeyBinding('ctrl+x')],
  [Command.PASTE_CLIPBOARD]: [
    new KeyBinding('ctrl+v'),
    new KeyBinding('cmd+v'),
    new KeyBinding('alt+v'),
  ],

  // App Controls
  [Command.SHOW_ERROR_DETAILS]: [new KeyBinding('f12')],
  [Command.SHOW_FULL_TODOS]: [new KeyBinding('ctrl+t')],
  [Command.SHOW_IDE_CONTEXT_DETAIL]: [new KeyBinding('ctrl+g')],
  [Command.TOGGLE_MARKDOWN]: [new KeyBinding('alt+m')],
  [Command.TOGGLE_COPY_MODE]: [new KeyBinding('ctrl+s')],
  [Command.TOGGLE_YOLO]: [new KeyBinding('ctrl+y')],
  [Command.CYCLE_APPROVAL_MODE]: [new KeyBinding('shift+tab')],
  [Command.TOGGLE_BACKGROUND_SHELL]: [new KeyBinding('ctrl+b')],
  [Command.TOGGLE_BACKGROUND_SHELL_LIST]: [new KeyBinding('ctrl+l')],
  [Command.KILL_BACKGROUND_SHELL]: [new KeyBinding('ctrl+k')],
  [Command.UNFOCUS_BACKGROUND_SHELL]: [new KeyBinding('shift+tab')],
  [Command.UNFOCUS_BACKGROUND_SHELL_LIST]: [new KeyBinding('tab')],
  [Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING]: [new KeyBinding('tab')],
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING]: [new KeyBinding('tab')],
  [Command.BACKGROUND_SHELL_SELECT]: [new KeyBinding('return')],
  [Command.BACKGROUND_SHELL_ESCAPE]: [new KeyBinding('escape')],
  [Command.SHOW_MORE_LINES]: [new KeyBinding('ctrl+o')],
  [Command.EXPAND_PASTE]: [new KeyBinding('ctrl+o')],
  [Command.FOCUS_SHELL_INPUT]: [new KeyBinding('tab')],
  [Command.UNFOCUS_SHELL_INPUT]: [new KeyBinding('shift+tab')],
  [Command.CLEAR_SCREEN]: [new KeyBinding('ctrl+l')],
  [Command.RESTART_APP]: [new KeyBinding('r'), new KeyBinding('shift+r')],
  [Command.SUSPEND_APP]: [new KeyBinding('ctrl+z')],
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
      Command.EXPAND_PASTE,
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
    'Open the current prompt or the plan in an external editor.',
  [Command.PASTE_CLIPBOARD]: 'Paste from the clipboard.',

  // App Controls
  [Command.SHOW_ERROR_DETAILS]: 'Toggle detailed error information.',
  [Command.SHOW_FULL_TODOS]: 'Toggle the full TODO list.',
  [Command.SHOW_IDE_CONTEXT_DETAIL]: 'Show IDE context details.',
  [Command.TOGGLE_MARKDOWN]: 'Toggle Markdown rendering.',
  [Command.TOGGLE_COPY_MODE]: 'Toggle copy mode when in alternate buffer mode.',
  [Command.TOGGLE_YOLO]: 'Toggle YOLO (auto-approval) mode for tool calls.',
  [Command.CYCLE_APPROVAL_MODE]:
    'Cycle through approval modes: default (prompt), auto_edit (auto-approve edits), and plan (read-only). Plan mode is skipped when the agent is busy.',
  [Command.SHOW_MORE_LINES]:
    'Expand and collapse blocks of content when not in alternate buffer mode.',
  [Command.EXPAND_PASTE]:
    'Expand or collapse a paste placeholder when cursor is over placeholder.',
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
    'Show warning when trying to move focus away from background shell.',
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING]:
    'Show warning when trying to move focus away from shell input.',
  [Command.FOCUS_SHELL_INPUT]: 'Move focus from Gemini to the active shell.',
  [Command.UNFOCUS_SHELL_INPUT]: 'Move focus from the shell back to Gemini.',
  [Command.CLEAR_SCREEN]: 'Clear the terminal screen and redraw the UI.',
  [Command.RESTART_APP]: 'Restart the application.',
  [Command.SUSPEND_APP]: 'Suspend the CLI and move it to the background.',
};
