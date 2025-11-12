/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

import type { KeyBinding } from '../packages/cli/src/config/keyBindings.js';
import {
  Command,
  defaultKeyBindings,
} from '../packages/cli/src/config/keyBindings.js';
import { formatWithPrettier, normalizeForCompare } from './utils/autogen.js';

const START_MARKER = '<!-- KEYBINDINGS-AUTOGEN:START -->';
const END_MARKER = '<!-- KEYBINDINGS-AUTOGEN:END -->';
const OUTPUT_RELATIVE_PATH = ['docs', 'cli', 'keyboard-shortcuts.md'];

interface CommandCategory {
  readonly title: string;
  readonly commands: readonly Command[];
}

const COMMAND_CATEGORIES: readonly CommandCategory[] = [
  {
    title: 'Basic Controls',
    commands: [Command.RETURN, Command.ESCAPE],
  },
  {
    title: 'Cursor Movement',
    commands: [Command.HOME, Command.END],
  },
  {
    title: 'Editing',
    commands: [
      Command.KILL_LINE_RIGHT,
      Command.KILL_LINE_LEFT,
      Command.CLEAR_INPUT,
      Command.DELETE_WORD_BACKWARD,
    ],
  },
  {
    title: 'Screen Control',
    commands: [Command.CLEAR_SCREEN],
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
    commands: [Command.OPEN_EXTERNAL_EDITOR, Command.PASTE_CLIPBOARD_IMAGE],
  },
  {
    title: 'App Controls',
    commands: [
      Command.SHOW_ERROR_DETAILS,
      Command.SHOW_FULL_TODOS,
      Command.TOGGLE_IDE_CONTEXT_DETAIL,
      Command.TOGGLE_MARKDOWN,
      Command.TOGGLE_COPY_MODE,
      Command.SHOW_MORE_LINES,
      Command.TOGGLE_SHELL_INPUT_FOCUS,
    ],
  },
  {
    title: 'Session Control',
    commands: [Command.QUIT, Command.EXIT],
  },
];

const COMMAND_DESCRIPTIONS: Record<Command, string> = {
  [Command.RETURN]: 'Confirm the current selection or choice.',
  [Command.ESCAPE]: 'Dismiss dialogs or cancel the current focus.',
  [Command.HOME]: 'Move the cursor to the start of the line.',
  [Command.END]: 'Move the cursor to the end of the line.',
  [Command.KILL_LINE_RIGHT]: 'Delete from the cursor to the end of the line.',
  [Command.KILL_LINE_LEFT]: 'Delete from the cursor to the start of the line.',
  [Command.CLEAR_INPUT]: 'Clear all text in the input field.',
  [Command.DELETE_WORD_BACKWARD]: 'Delete the previous word.',
  [Command.CLEAR_SCREEN]: 'Clear the terminal screen and redraw the UI.',
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
  [Command.PASTE_CLIPBOARD_IMAGE]: 'Paste an image from the clipboard.',
  [Command.SHOW_ERROR_DETAILS]: 'Toggle detailed error information.',
  [Command.SHOW_FULL_TODOS]: 'Toggle the full TODO list.',
  [Command.TOGGLE_IDE_CONTEXT_DETAIL]: 'Toggle IDE context details.',
  [Command.TOGGLE_MARKDOWN]: 'Toggle Markdown rendering.',
  [Command.TOGGLE_COPY_MODE]: 'Toggle copy mode in the alternate buffer.',
  [Command.QUIT]: 'Cancel the current request or quit the CLI.',
  [Command.EXIT]: 'Exit the CLI when the input buffer is empty.',
  [Command.SHOW_MORE_LINES]: 'Expand the current response to show more lines.',
  [Command.REVERSE_SEARCH]: 'Start reverse search through history.',
  [Command.SUBMIT_REVERSE_SEARCH]: 'Insert the selected reverse-search match.',
  [Command.ACCEPT_SUGGESTION_REVERSE_SEARCH]:
    'Accept a suggestion while reverse searching.',
  [Command.TOGGLE_SHELL_INPUT_FOCUS]:
    'Toggle focus between the shell and Gemini input.',
  [Command.EXPAND_SUGGESTION]: 'Expand an inline suggestion.',
  [Command.COLLAPSE_SUGGESTION]: 'Collapse an inline suggestion.',
};

const KEY_NAME_OVERRIDES: Record<string, string> = {
  return: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'Up Arrow',
  down: 'Down Arrow',
  left: 'Left Arrow',
  right: 'Right Arrow',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  clear: 'Clear',
  insert: 'Insert',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
};

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');
  validateConfiguration();

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const docPath = path.join(repoRoot, ...OUTPUT_RELATIVE_PATH);

  const generatedBlock = renderDocumentation();
  const currentDoc = await readFile(docPath, 'utf8');

  const startIndex = currentDoc.indexOf(START_MARKER);
  const endIndex = currentDoc.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error(
      `Could not locate documentation markers (${START_MARKER}, ${END_MARKER}).`,
    );
  }

  const before = currentDoc.slice(0, startIndex + START_MARKER.length);
  const after = currentDoc.slice(endIndex);
  const updatedDoc = await formatWithPrettier(
    `${before}\n\n${generatedBlock}\n${after}`,
    docPath,
  );

  if (normalizeForCompare(updatedDoc) === normalizeForCompare(currentDoc)) {
    if (!checkOnly) {
      console.log('Keybinding documentation already up to date.');
    }
    return;
  }

  if (checkOnly) {
    console.error(
      'Keybinding documentation is out of date. Run `npm run docs:keybindings` to regenerate.',
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(docPath, updatedDoc, 'utf8');
  console.log('Keybinding documentation regenerated.');
}

function validateConfiguration() {
  const allCommands = new Set<Command>(Object.values(Command));
  const categorized = new Set<Command>();

  for (const category of COMMAND_CATEGORIES) {
    for (const command of category.commands) {
      categorized.add(command);
    }
  }

  for (const command of Object.values(Command)) {
    if (!COMMAND_DESCRIPTIONS[command]) {
      throw new Error(`Missing description for command: ${command}`);
    }
  }

  const missing = [...allCommands].filter(
    (command) => !categorized.has(command),
  );
  if (missing.length > 0) {
    throw new Error(
      `Command categories are missing definitions for: ${missing.join(', ')}`,
    );
  }
}

function renderDocumentation(): string {
  const sections = COMMAND_CATEGORIES.map((category) => {
    const rows = category.commands.map((command) => {
      const bindings = defaultKeyBindings[command];
      const formattedBindings = formatBindings(bindings);
      const description = COMMAND_DESCRIPTIONS[command];
      const keysCell = formattedBindings.join('<br />');
      return `| ${description} | ${keysCell} |`;
    });

    return [
      `#### ${category.title}`,
      '',
      '| Action | Keys |',
      '| --- | --- |',
      ...rows,
    ].join('\n');
  });

  return sections.join('\n\n');
}

function formatBindings(bindings: readonly KeyBinding[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const binding of bindings) {
    const label = formatBinding(binding);
    if (label && !seen.has(label)) {
      seen.add(label);
      results.push(label);
    }
  }

  return results;
}

function formatBinding(binding: KeyBinding): string {
  const modifiers: string[] = [];
  if (binding.ctrl) modifiers.push('Ctrl');
  if (binding.command) modifiers.push('Cmd');
  if (binding.shift) modifiers.push('Shift');
  if (binding.paste) modifiers.push('Paste');

  const keyName = binding.key
    ? formatKeyName(binding.key)
    : binding.sequence
      ? formatSequence(binding.sequence)
      : '';

  if (!keyName) {
    return '';
  }

  const segments = [...modifiers, keyName].filter(Boolean);
  let combo = segments.join(' + ');

  const restrictions: string[] = [];
  if (binding.ctrl === false) restrictions.push('no Ctrl');
  if (binding.shift === false) restrictions.push('no Shift');
  if (binding.command === false) restrictions.push('no Cmd');
  if (binding.paste === false) restrictions.push('not Paste');

  if (restrictions.length > 0) {
    combo = `${combo} (${restrictions.join(', ')})`;
  }

  return combo ? `\`${combo}\`` : '';
}

function formatKeyName(key: string): string {
  const normalized = key.toLowerCase();
  if (KEY_NAME_OVERRIDES[normalized]) {
    return KEY_NAME_OVERRIDES[normalized];
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

function formatSequence(sequence: string): string {
  if (sequence.length === 1) {
    const code = sequence.charCodeAt(0);
    if (code >= 1 && code <= 26) {
      return String.fromCharCode(code + 64);
    }
    if (code === 10 || code === 13) {
      return 'Enter';
    }
    if (code === 9) {
      return 'Tab';
    }
  }
  return JSON.stringify(sequence);
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
