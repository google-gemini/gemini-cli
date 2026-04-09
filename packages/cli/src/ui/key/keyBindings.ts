/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { parse as parseIgnoringComments } from 'comment-json';
import { isNodeError, Storage } from '@google/gemini-cli-core';

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
  QUEUE_MESSAGE = 'input.queueMessage',
  NEWLINE = 'input.newline',
  OPEN_EXTERNAL_EDITOR = 'input.openExternalEditor',
  DEPRECATED_OPEN_EXTERNAL_EDITOR = 'input.deprecatedOpenExternalEditor',
  PASTE_CLIPBOARD = 'input.paste',

  // App Controls
  SHOW_ERROR_DETAILS = 'app.showErrorDetails',
  SHOW_FULL_TODOS = 'app.showFullTodos',
  SHOW_IDE_CONTEXT_DETAIL = 'app.showIdeContextDetail',
  TOGGLE_MARKDOWN = 'app.toggleMarkdown',
  TOGGLE_COPY_MODE = 'app.toggleCopyMode',
  TOGGLE_MOUSE_MODE = 'app.toggleMouseMode',
  TOGGLE_YOLO = 'app.toggleYolo',
  CYCLE_APPROVAL_MODE = 'app.cycleApprovalMode',
  SHOW_MORE_LINES = 'app.showMoreLines',
  EXPAND_PASTE = 'app.expandPaste',
  FOCUS_SHELL_INPUT = 'app.focusShellInput',
  UNFOCUS_SHELL_INPUT = 'app.unfocusShellInput',
  CLEAR_SCREEN = 'app.clearScreen',
  RESTART_APP = 'app.restart',
  SUSPEND_APP = 'app.suspend',
  SHOW_SHELL_INPUT_UNFOCUS_WARNING = 'app.showShellUnfocusWarning',

  // Background Shell Controls
  BACKGROUND_SHELL_ESCAPE = 'background.escape',
  BACKGROUND_SHELL_SELECT = 'background.select',
  TOGGLE_BACKGROUND_SHELL = 'background.toggle',
  TOGGLE_BACKGROUND_SHELL_LIST = 'background.toggleList',
  KILL_BACKGROUND_SHELL = 'background.kill',
  UNFOCUS_BACKGROUND_SHELL = 'background.unfocus',
  UNFOCUS_BACKGROUND_SHELL_LIST = 'background.unfocusList',
  SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING = 'background.unfocusWarning',

  // Extension Controls
  UPDATE_EXTENSION = 'extension.update',
  LINK_EXTENSION = 'extension.link',

  DUMP_FRAME = 'app.dumpFrame',
  START_RECORDING = 'app.startRecording',
  STOP_RECORDING = 'app.stopRecording',
}

/**
 * Data-driven key binding structure for user configuration
 */
export class KeyBinding {
  private static readonly VALID_LONG_KEYS = new Set([
    ...Array.from({ length: 35 }, (_, i) => `f${i + 1}`), // Function Keys
    ...Array.from({ length: 10 }, (_, i) => `numpad${i}`), // Numpad Numbers
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
    'clear',
    'pausebreak',
    'capslock',
    'insert',
    'numlock',
    'scrolllock',
    'printscreen',
    'numpad_multiply',
    'numpad_add',
    'numpad_separator',
    'numpad_subtract',
    'numpad_decimal',
    'numpad_divide',
  ]);

  /** The key name (e.g., 'a', 'enter', 'tab', 'escape') */
  readonly name: string;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly cmd: boolean;

  constructor(pattern: string) {
    let remains = pattern.trim();
    let shift = false;
    let alt = false;
    let ctrl = false;
    let cmd = false;

    let matched: boolean;
    do {
      matched = false;
      const lowerRemains = remains.toLowerCase();
      if (lowerRemains.startsWith('ctrl+')) {
        ctrl = true;
        remains = remains.slice(5);
        matched = true;
      } else if (lowerRemains.startsWith('shift+')) {
        shift = true;
        remains = remains.slice(6);
        matched = true;
      } else if (lowerRemains.startsWith('alt+')) {
        alt = true;
        remains = remains.slice(4);
        matched = true;
      } else if (lowerRemains.startsWith('option+')) {
        alt = true;
        remains = remains.slice(7);
        matched = true;
      } else if (lowerRemains.startsWith('opt+')) {
        alt = true;
        remains = remains.slice(4);
        matched = true;
      } else if (lowerRemains.startsWith('cmd+')) {
        cmd = true;
        remains = remains.slice(4);
        matched = true;
      } else if (lowerRemains.startsWith('meta+')) {
        cmd = true;
        remains = remains.slice(5);
        matched = true;
      }
    } while (matched);

    const key = remains;

    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    const isSingleChar = [...key].length === 1;

    if (!isSingleChar && !KeyBinding.VALID_LONG_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `Invalid keybinding key: "${key}" in "${pattern}".` +
          ` Must be a single character or one of: ${[...KeyBinding.VALID_LONG_KEYS].join(', ')}`,
      );
    }

    this.name = key.toLowerCase();
    this.shift = shift || (isSingleChar && this.name !== key);
    this.alt = alt;
    this.ctrl = ctrl;
    this.cmd = cmd;
  }

  matches(key: Key): boolean {
    return (
      key.name === this.name &&
      !!key.shift === !!this.shift &&
      !!key.alt === !!this.alt &&
      !!key.ctrl === !!this.ctrl &&
      !!key.cmd === !!this.cmd
    );
  }

  equals(other: KeyBinding): boolean {
    return (
      this.name === other.name &&
      this.shift === other.shift &&
      this.alt === other.alt &&
      this.ctrl === other.ctrl &&
      this.cmd === other.cmd
    );
  }
}

/**
 * Configuration type mapping commands to their key bindings
 */
export type KeyBindingConfig = Map<Command, readonly KeyBinding[]>;

/**
 * Default key binding configuration
 * Matches the original hard-coded logic exactly
 */
export const defaultKeyBindingConfig: KeyBindingConfig = new Map([
  // Basic Controls
  [Command.RETURN, [new KeyBinding('enter')]],
  [Command.ESCAPE, [new KeyBinding('escape'), new KeyBinding('ctrl+[')]],
  [Command.QUIT, [new KeyBinding('ctrl+c')]],
  [Command.EXIT, [new KeyBinding('ctrl+d')]],

  // Cursor Movement
  [Command.HOME, [new KeyBinding('ctrl+a'), new KeyBinding('home')]],
  [Command.END, [new KeyBinding('ctrl+e'), new KeyBinding('end')]],
  [Command.MOVE_UP, [new KeyBinding('up')]],
  [Command.MOVE_DOWN, [new KeyBinding('down')]],
  [Command.MOVE_LEFT, [new KeyBinding('left')]],
  [Command.MOVE_RIGHT, [new KeyBinding('right'), new KeyBinding('ctrl+f')]],
  [
    Command.MOVE_WORD_LEFT,
    [
      new KeyBinding('ctrl+left'),
      new KeyBinding('alt+left'),
      new KeyBinding('alt+b'),
    ],
  ],
  [
    Command.MOVE_WORD_RIGHT,
    [
      new KeyBinding('ctrl+right'),
      new KeyBinding('alt+right'),
      new KeyBinding('alt+f'),
    ],
  ],

  // Editing
  [Command.KILL_LINE_RIGHT, [new KeyBinding('ctrl+k')]],
  [Command.KILL_LINE_LEFT, [new KeyBinding('ctrl+u')]],
  [Command.CLEAR_INPUT, [new KeyBinding('ctrl+c')]],
  [
    Command.DELETE_WORD_BACKWARD,
    [
      new KeyBinding('ctrl+backspace'),
      new KeyBinding('alt+backspace'),
      new KeyBinding('ctrl+w'),
    ],
  ],
  [
    Command.DELETE_WORD_FORWARD,
    [
      new KeyBinding('ctrl+delete'),
      new KeyBinding('alt+delete'),
      new KeyBinding('alt+d'),
    ],
  ],
  [
    Command.DELETE_CHAR_LEFT,
    [new KeyBinding('backspace'), new KeyBinding('ctrl+h')],
  ],
  [
    Command.DELETE_CHAR_RIGHT,
    [new KeyBinding('delete'), new KeyBinding('ctrl+d')],
  ],
  [Command.UNDO, [new KeyBinding('cmd+z'), new KeyBinding('alt+z')]],
  [
    Command.REDO,
    [
      new KeyBinding('ctrl+shift+z'),
      new KeyBinding('cmd+shift+z'),
      new KeyBinding('alt+shift+z'),
    ],
  ],

  // Scrolling
  [Command.SCROLL_UP, [new KeyBinding('shift+up')]],
  [Command.SCROLL_DOWN, [new KeyBinding('shift+down')]],
  [
    Command.SCROLL_HOME,
    [new KeyBinding('ctrl+home'), new KeyBinding('shift+home')],
  ],
  [
    Command.SCROLL_END,
    [new KeyBinding('ctrl+end'), new KeyBinding('shift+end')],
  ],
  [Command.PAGE_UP, [new KeyBinding('pageup')]],
  [Command.PAGE_DOWN, [new KeyBinding('pagedown')]],

  // History & Search
  [Command.HISTORY_UP, [new KeyBinding('ctrl+p')]],
  [Command.HISTORY_DOWN, [new KeyBinding('ctrl+n')]],
  [Command.REVERSE_SEARCH, [new KeyBinding('ctrl+r')]],
  [Command.SUBMIT_REVERSE_SEARCH, [new KeyBinding('enter')]],
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH, [new KeyBinding('tab')]],

  // Navigation
  [Command.NAVIGATION_UP, [new KeyBinding('up')]],
  [Command.NAVIGATION_DOWN, [new KeyBinding('down')]],
  // Navigation shortcuts appropriate for dialogs where we do not need to accept
  // text input.
  [Command.DIALOG_NAVIGATION_UP, [new KeyBinding('up'), new KeyBinding('k')]],
  [
    Command.DIALOG_NAVIGATION_DOWN,
    [new KeyBinding('down'), new KeyBinding('j')],
  ],
  [Command.DIALOG_NEXT, [new KeyBinding('tab')]],
  [Command.DIALOG_PREV, [new KeyBinding('shift+tab')]],

  // Suggestions & Completions
  [Command.ACCEPT_SUGGESTION, [new KeyBinding('tab'), new KeyBinding('enter')]],
  [Command.COMPLETION_UP, [new KeyBinding('up'), new KeyBinding('ctrl+p')]],
  [Command.COMPLETION_DOWN, [new KeyBinding('down'), new KeyBinding('ctrl+n')]],
  [Command.EXPAND_SUGGESTION, [new KeyBinding('right')]],
  [Command.COLLAPSE_SUGGESTION, [new KeyBinding('left')]],

  // Text Input
  // Must also exclude shift to allow shift+enter for newline
  [Command.SUBMIT, [new KeyBinding('enter')]],
  [Command.QUEUE_MESSAGE, [new KeyBinding('tab')]],
  [
    Command.NEWLINE,
    [
      new KeyBinding('ctrl+enter'),
      new KeyBinding('cmd+enter'),
      new KeyBinding('alt+enter'),
      new KeyBinding('shift+enter'),
      new KeyBinding('ctrl+j'),
    ],
  ],
  [Command.OPEN_EXTERNAL_EDITOR, [new KeyBinding('ctrl+g')]],
  [Command.DEPRECATED_OPEN_EXTERNAL_EDITOR, [new KeyBinding('ctrl+x')]],
  [
    Command.PASTE_CLIPBOARD,
    [
      new KeyBinding('ctrl+v'),
      new KeyBinding('cmd+v'),
      new KeyBinding('alt+v'),
    ],
  ],

  // App Controls
  [Command.SHOW_ERROR_DETAILS, [new KeyBinding('f12')]],
  [Command.SHOW_FULL_TODOS, [new KeyBinding('ctrl+t')]],
  [Command.SHOW_IDE_CONTEXT_DETAIL, [new KeyBinding('f4')]],
  [Command.TOGGLE_MARKDOWN, [new KeyBinding('alt+m')]],
  [Command.TOGGLE_COPY_MODE, [new KeyBinding('f9')]],
  [Command.TOGGLE_MOUSE_MODE, [new KeyBinding('ctrl+s')]],
  [Command.TOGGLE_YOLO, [new KeyBinding('ctrl+y')]],
  [Command.CYCLE_APPROVAL_MODE, [new KeyBinding('shift+tab')]],
  [Command.SHOW_MORE_LINES, [new KeyBinding('ctrl+o')]],
  [Command.EXPAND_PASTE, [new KeyBinding('ctrl+o')]],
  [Command.FOCUS_SHELL_INPUT, [new KeyBinding('tab')]],
  [Command.UNFOCUS_SHELL_INPUT, [new KeyBinding('shift+tab')]],
  [Command.CLEAR_SCREEN, [new KeyBinding('ctrl+l')]],
  [Command.RESTART_APP, [new KeyBinding('r'), new KeyBinding('shift+r')]],
  [Command.SUSPEND_APP, [new KeyBinding('ctrl+z')]],
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING, [new KeyBinding('tab')]],
  [Command.DUMP_FRAME, [new KeyBinding('f8')]],
  [Command.START_RECORDING, [new KeyBinding('f6')]],
  [Command.STOP_RECORDING, [new KeyBinding('f7')]],

  // Background Shell Controls
  [Command.BACKGROUND_SHELL_ESCAPE, [new KeyBinding('escape')]],
  [Command.BACKGROUND_SHELL_SELECT, [new KeyBinding('enter')]],
  [Command.TOGGLE_BACKGROUND_SHELL, [new KeyBinding('ctrl+b')]],
  [Command.TOGGLE_BACKGROUND_SHELL_LIST, [new KeyBinding('ctrl+l')]],
  [Command.KILL_BACKGROUND_SHELL, [new KeyBinding('ctrl+k')]],
  [Command.UNFOCUS_BACKGROUND_SHELL, [new KeyBinding('shift+tab')]],
  [Command.UNFOCUS_BACKGROUND_SHELL_LIST, [new KeyBinding('tab')]],
  [Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING, [new KeyBinding('tab')]],

  // Extension Controls
  [Command.UPDATE_EXTENSION, [new KeyBinding('i')]],
  [Command.LINK_EXTENSION, [new KeyBinding('l')]],
]);

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
      Command.QUEUE_MESSAGE,
      Command.NEWLINE,
      Command.OPEN_EXTERNAL_EDITOR,
      Command.DEPRECATED_OPEN_EXTERNAL_EDITOR,
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
      Command.TOGGLE_MOUSE_MODE,
      Command.TOGGLE_YOLO,
      Command.CYCLE_APPROVAL_MODE,
      Command.SHOW_MORE_LINES,
      Command.EXPAND_PASTE,
      Command.FOCUS_SHELL_INPUT,
      Command.UNFOCUS_SHELL_INPUT,
      Command.CLEAR_SCREEN,
      Command.RESTART_APP,
      Command.SUSPEND_APP,
      Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING,
    ],
  },
  {
    title: 'Background Shell Controls',
    commands: [
      Command.BACKGROUND_SHELL_ESCAPE,
      Command.BACKGROUND_SHELL_SELECT,
      Command.TOGGLE_BACKGROUND_SHELL,
      Command.TOGGLE_BACKGROUND_SHELL_LIST,
      Command.KILL_BACKGROUND_SHELL,
      Command.UNFOCUS_BACKGROUND_SHELL,
      Command.UNFOCUS_BACKGROUND_SHELL_LIST,
      Command.SHOW_BACKGROUND_SHELL_UNFOCUS_WARNING,
      Command.DUMP_FRAME,
      Command.START_RECORDING,
      Command.STOP_RECORDING,
    ],
  },
  {
    title: 'Extension Controls',
    commands: [Command.UPDATE_EXTENSION, Command.LINK_EXTENSION],
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
  [Command.QUEUE_MESSAGE]:
    'Queue the current prompt to be processed after the current task finishes.',
  [Command.NEWLINE]: 'Insert a newline without submitting.',
  [Command.OPEN_EXTERNAL_EDITOR]:
    'Open the current prompt or the plan in an external editor.',
  [Command.DEPRECATED_OPEN_EXTERNAL_EDITOR]:
    'Deprecated command to open external editor.',
  [Command.PASTE_CLIPBOARD]: 'Paste from the clipboard.',

  // App Controls
  [Command.SHOW_ERROR_DETAILS]: 'Toggle detailed error information.',
  [Command.SHOW_FULL_TODOS]: 'Toggle the full TODO list.',
  [Command.SHOW_IDE_CONTEXT_DETAIL]: 'Show IDE context details.',
  [Command.TOGGLE_MARKDOWN]: 'Toggle Markdown rendering.',
  [Command.TOGGLE_COPY_MODE]: 'Toggle copy mode when in alternate buffer mode.',
  [Command.TOGGLE_MOUSE_MODE]: 'Toggle mouse mode (scrolling and clicking).',
  [Command.TOGGLE_YOLO]: 'Toggle YOLO (auto-approval) mode for tool calls.',
  [Command.CYCLE_APPROVAL_MODE]:
    'Cycle through approval modes: default (prompt), auto_edit (auto-approve edits), and plan (read-only). Plan mode is skipped when the agent is busy.',
  [Command.SHOW_MORE_LINES]:
    'Expand and collapse blocks of content when not in alternate buffer mode.',
  [Command.EXPAND_PASTE]:
    'Expand or collapse a paste placeholder when cursor is over placeholder.',
  [Command.FOCUS_SHELL_INPUT]: 'Move focus from Gemini to the active shell.',
  [Command.UNFOCUS_SHELL_INPUT]: 'Move focus from the shell back to Gemini.',
  [Command.CLEAR_SCREEN]: 'Clear the terminal screen and redraw the UI.',
  [Command.RESTART_APP]: 'Restart the application.',
  [Command.SUSPEND_APP]: 'Suspend the CLI and move it to the background.',
  [Command.SHOW_SHELL_INPUT_UNFOCUS_WARNING]:
    'Show warning when trying to move focus away from shell input.',

  // Background Shell Controls
  [Command.BACKGROUND_SHELL_ESCAPE]: 'Dismiss background shell list.',
  [Command.BACKGROUND_SHELL_SELECT]:
    'Confirm selection in background shell list.',
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

  // Extension Controls
  [Command.UPDATE_EXTENSION]: 'Update the current extension if available.',
  [Command.LINK_EXTENSION]: 'Link the current extension to a local path.',

  [Command.DUMP_FRAME]: 'Dump the current frame as a snapshot.',
  [Command.START_RECORDING]: 'Start recording the session.',
  [Command.STOP_RECORDING]: 'Stop recording the session.',
};

const keybindingsSchema = z.array(
  z
    .object({
      command: z.string().transform((val, ctx) => {
        const negate = val.startsWith('-');
        const commandId = negate ? val.slice(1) : val;

        const result = z.nativeEnum(Command).safeParse(commandId);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid command: "${val}".`,
          });
          return z.NEVER;
        }

        return {
          command: result.data,
          negate,
        };
      }),
      key: z.string(),
    })
    .transform((val) => ({
      commandEntry: val.command,
      key: val.key,
    })),
);

/**
 * Loads custom keybindings from the user's keybindings.json file.
 * Keybindings are merged with the default bindings.
 */
export async function loadCustomKeybindings(): Promise<{
  config: KeyBindingConfig;
  errors: string[];
}> {
  const errors: string[] = [];
  let config = defaultKeyBindingConfig;

  const userKeybindingsPath = Storage.getUserKeybindingsPath();

  try {
    const content = await fs.readFile(userKeybindingsPath, 'utf8');
    const parsedJson = parseIgnoringComments(content);
    const result = keybindingsSchema.safeParse(parsedJson);

    if (result.success) {
      config = new Map(defaultKeyBindingConfig);
      for (const { commandEntry, key } of result.data) {
        const { command, negate } = commandEntry;
        const currentBindings = config.get(command) ?? [];

        try {
          const keyBinding = new KeyBinding(key);

          if (negate) {
            const updatedBindings = currentBindings.filter(
              (b) => !b.equals(keyBinding),
            );
            if (updatedBindings.length === currentBindings.length) {
              throw new Error(`cannot remove "${key}" since it is not bound`);
            }
            config.set(command, updatedBindings);
          } else {
            // Add new binding (prepend so it's the primary one shown in UI)
            config.set(command, [keyBinding, ...currentBindings]);
          }
        } catch (e) {
          errors.push(
            `Invalid keybinding for command "${negate ? '-' : ''}${command}": ${e}`,
          );
        }
      }
    } else {
      errors.push(
        ...result.error.issues.map(
          (issue) =>
            `Keybindings file "${userKeybindingsPath}" error at ${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      // File doesn't exist, use default bindings
    } else {
      errors.push(
        `Error reading keybindings file "${userKeybindingsPath}": ${error}`,
      );
    }
  }

  return { config, errors };
}
