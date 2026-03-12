/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { debugLogger } from './debugLogger.js';
import { coreEvents, CoreEvent, type EditorSelectedPayload } from './events.js';

const GUI_EDITORS = [
  'vscode',
  'vscodium',
  'windsurf',
  'cursor',
  'zed',
  'antigravity',
] as const;
const TERMINAL_EDITORS = ['vim', 'neovim', 'emacs', 'hx'] as const;
const BUILTIN_EDITORS = [...GUI_EDITORS, ...TERMINAL_EDITORS] as const;
const EDITORS = [...BUILTIN_EDITORS, 'custom'] as const;

const GUI_EDITORS_SET = new Set<string>(GUI_EDITORS);
const TERMINAL_EDITORS_SET = new Set<string>(TERMINAL_EDITORS);
const EDITORS_SET = new Set<string>(EDITORS);

export const NO_EDITOR_AVAILABLE_ERROR =
  'No external editor is available. Please run /editor to configure one.';

export const DEFAULT_GUI_EDITOR: GuiEditorType = 'vscode';

export type GuiEditorType = (typeof GUI_EDITORS)[number];
export type TerminalEditorType = (typeof TERMINAL_EDITORS)[number];
export type BuiltinEditorType = (typeof BUILTIN_EDITORS)[number];
export type EditorType = (typeof EDITORS)[number];

export function isGuiEditor(editor: EditorType): editor is GuiEditorType {
  return GUI_EDITORS_SET.has(editor);
}

export function isTerminalEditor(
  editor: EditorType,
): editor is TerminalEditorType {
  return TERMINAL_EDITORS_SET.has(editor);
}

export const EDITOR_DISPLAY_NAMES: Record<EditorType, string> = {
  vscode: 'VS Code',
  vscodium: 'VSCodium',
  windsurf: 'Windsurf',
  cursor: 'Cursor',
  vim: 'Vim',
  neovim: 'Neovim',
  zed: 'Zed',
  emacs: 'Emacs',
  antigravity: 'Antigravity',
  hx: 'Helix',
  custom: 'Custom ($VISUAL / $EDITOR)',
};

export function getEditorDisplayName(editor: EditorType): string {
  return EDITOR_DISPLAY_NAMES[editor] || editor;
}

function isValidEditorType(editor: string): editor is EditorType {
  return EDITORS_SET.has(editor);
}

/**
 * Escapes a string for use in an Emacs Lisp string literal.
 * Wraps in double quotes and escapes backslashes and double quotes.
 */
function escapeELispString(str: string): string {
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Maps the basename of a command to a known built-in editor type so that
 * custom editor commands (from $VISUAL / $EDITOR) can reuse the diff
 * arguments and execution strategy of a recognized editor.
 */
const COMMAND_TO_EDITOR: Record<string, BuiltinEditorType> = {
  code: 'vscode',
  codium: 'vscodium',
  'code.cmd': 'vscode',
  'codium.cmd': 'vscodium',
  windsurf: 'windsurf',
  cursor: 'cursor',
  vim: 'vim',
  vi: 'vim',
  nvim: 'neovim',
  emacs: 'emacs',
  'emacs.exe': 'emacs',
  nano: 'vim', // nano lacks diff mode; fall back to opening new file
  hx: 'hx',
  zed: 'zed',
  zeditor: 'zed',
  agy: 'antigravity',
  antigravity: 'antigravity',
};

/**
 * Resolves the editor command from the $VISUAL and $EDITOR environment
 * variables, following the POSIX convention of preferring $VISUAL.
 * Returns undefined when neither variable is set to a non-empty value.
 */
export function resolveCustomEditorCommand(): string | undefined {
  const visual = process.env['VISUAL']?.trim();
  if (visual) {
    return visual;
  }
  const editor = process.env['EDITOR']?.trim();
  if (editor) {
    return editor;
  }
  return undefined;
}

/**
 * Given a command string (potentially a full path), extracts the basename
 * and returns the matching built-in editor type, or undefined if no match.
 */
function detectEditorFlavor(command: string): BuiltinEditorType | undefined {
  const parts = command.split(/[\\/]/);
  const basename = parts[parts.length - 1];
  return COMMAND_TO_EDITOR[basename];
}

interface DiffCommand {
  command: string;
  args: string[];
}

const execAsync = promisify(exec);

function getCommandExistsCmd(cmd: string): string {
  return process.platform === 'win32'
    ? `where.exe ${cmd}`
    : `command -v ${cmd}`;
}

function commandExists(cmd: string): boolean {
  try {
    execSync(getCommandExistsCmd(cmd), { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function commandExistsAsync(cmd: string): Promise<boolean> {
  try {
    await execAsync(getCommandExistsCmd(cmd));
    return true;
  } catch {
    return false;
  }
}

/**
 * Editor command configurations for different platforms.
 * Each editor can have multiple possible command names, listed in order of preference.
 */
const editorCommands: Record<
  BuiltinEditorType,
  { win32: string[]; default: string[] }
> = {
  vscode: { win32: ['code.cmd'], default: ['code'] },
  vscodium: { win32: ['codium.cmd'], default: ['codium'] },
  windsurf: { win32: ['windsurf'], default: ['windsurf'] },
  cursor: { win32: ['cursor'], default: ['cursor'] },
  vim: { win32: ['vim'], default: ['vim'] },
  neovim: { win32: ['nvim'], default: ['nvim'] },
  zed: { win32: ['zed'], default: ['zed', 'zeditor'] },
  emacs: { win32: ['emacs.exe'], default: ['emacs'] },
  antigravity: {
    win32: ['agy.cmd', 'antigravity.cmd', 'antigravity'],
    default: ['agy', 'antigravity'],
  },
  hx: { win32: ['hx'], default: ['hx'] },
};

function getEditorCommands(editor: EditorType): string[] {
  if (editor === 'custom') {
    const cmd = resolveCustomEditorCommand();
    return cmd ? [cmd] : [];
  }
  const commandConfig = editorCommands[editor];
  return process.platform === 'win32'
    ? commandConfig.win32
    : commandConfig.default;
}

export function hasValidEditorCommand(editor: EditorType): boolean {
  if (editor === 'custom') {
    const cmd = resolveCustomEditorCommand();
    return !!cmd && commandExists(cmd);
  }
  return getEditorCommands(editor).some((cmd) => commandExists(cmd));
}

export async function hasValidEditorCommandAsync(
  editor: EditorType,
): Promise<boolean> {
  if (editor === 'custom') {
    const cmd = resolveCustomEditorCommand();
    return !!cmd && commandExistsAsync(cmd);
  }
  return Promise.any(
    getEditorCommands(editor).map((cmd) =>
      commandExistsAsync(cmd).then((exists) => exists || Promise.reject()),
    ),
  ).catch(() => false);
}

export function getEditorCommand(editor: EditorType): string {
  if (editor === 'custom') {
    return resolveCustomEditorCommand() || '';
  }
  const commands = getEditorCommands(editor);
  return (
    commands.slice(0, -1).find((cmd) => commandExists(cmd)) ||
    commands[commands.length - 1]
  );
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env['SANDBOX'];
  if (editor === 'custom') {
    // For custom editors, check what the resolved command maps to.
    // If it maps to a GUI editor, block in sandbox; otherwise allow.
    const cmd = resolveCustomEditorCommand();
    if (cmd) {
      const flavor = detectEditorFlavor(cmd);
      if (flavor && isGuiEditor(flavor)) {
        return notUsingSandbox;
      }
    }
    return true;
  }
  if (isGuiEditor(editor)) {
    return notUsingSandbox;
  }
  // For terminal-based editors like vim and emacs, allow in sandbox.
  return true;
}

function isEditorTypeAvailable(
  editor: string | undefined,
): editor is EditorType {
  return (
    !!editor && isValidEditorType(editor) && allowEditorTypeInSandbox(editor)
  );
}

/**
 * Check if the editor is valid and can be used.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 */
export function isEditorAvailable(editor: string | undefined): boolean {
  return isEditorTypeAvailable(editor) && hasValidEditorCommand(editor);
}

/**
 * Check if the editor is valid and can be used.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 */
export async function isEditorAvailableAsync(
  editor: string | undefined,
): Promise<boolean> {
  return (
    isEditorTypeAvailable(editor) && (await hasValidEditorCommandAsync(editor))
  );
}

/**
 * Resolves an editor to use for external editing without blocking the event loop.
 * 1. If a preferred editor is set and available, uses it.
 * 2. If no preferred editor is set (or preferred is unavailable), requests selection from user and waits for it.
 */
export async function resolveEditorAsync(
  preferredEditor: EditorType | undefined,
  signal?: AbortSignal,
): Promise<EditorType | undefined> {
  if (preferredEditor && (await isEditorAvailableAsync(preferredEditor))) {
    return preferredEditor;
  }

  coreEvents.emit(CoreEvent.RequestEditorSelection);

  return (
    once(coreEvents, CoreEvent.EditorSelected, { signal })
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      .then(([payload]) => (payload as EditorSelectedPayload).editor)
      .catch(() => undefined)
  );
}

/**
 * Get the diff command for a specific editor.
 */
export function getDiffCommand(
  oldPath: string,
  newPath: string,
  editor: EditorType,
): DiffCommand | null {
  if (!isValidEditorType(editor)) {
    return null;
  }

  // For custom editors, resolve the command from env vars and delegate
  // to the matching built-in editor's diff args when possible.
  if (editor === 'custom') {
    const command = resolveCustomEditorCommand();
    if (!command) {
      return null;
    }
    const flavor = detectEditorFlavor(command);
    if (flavor) {
      // Reuse the built-in editor's diff arguments with the custom command
      const builtinDiff = getDiffCommand(oldPath, newPath, flavor);
      if (builtinDiff) {
        return { command, args: builtinDiff.args };
      }
    }
    // Unknown editor: just open the new file for editing
    return { command, args: [newPath] };
  }

  const command = getEditorCommand(editor);

  switch (editor) {
    case 'vscode':
    case 'vscodium':
    case 'windsurf':
    case 'cursor':
    case 'zed':
    case 'antigravity':
      return { command, args: ['--wait', '--diff', oldPath, newPath] };
    case 'vim':
    case 'neovim':
      return {
        command,
        args: [
          '-d',
          // skip viminfo file to avoid E138 errors
          '-i',
          'NONE',
          // make the left window read-only and the right window editable
          '-c',
          'wincmd h | set readonly | wincmd l',
          // set up colors for diffs
          '-c',
          'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
          // Show helpful messages
          '-c',
          'set showtabline=2 | set tabline=[Instructions]\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
          '-c',
          'wincmd h | setlocal statusline=OLD\\ FILE',
          '-c',
          'wincmd l | setlocal statusline=%#StatusBold#NEW\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
          // Auto close all windows when one is closed
          '-c',
          'autocmd BufWritePost * wqa',
          oldPath,
          newPath,
        ],
      };
    case 'emacs':
      return {
        command: 'emacs',
        args: [
          '--eval',
          `(ediff ${escapeELispString(oldPath)} ${escapeELispString(newPath)})`,
        ],
      };
    case 'hx':
      return {
        command: 'hx',
        args: ['--vsplit', '--', oldPath, newPath],
      };
    default:
      return null;
  }
}

/**
 * Opens a diff tool to compare two files.
 * Terminal-based editors by default blocks parent process until the editor exits.
 * GUI-based editors require args such as "--wait" to block parent process.
 */
export async function openDiff(
  oldPath: string,
  newPath: string,
  editor: EditorType,
): Promise<void> {
  const diffCommand = getDiffCommand(oldPath, newPath, editor);
  if (!diffCommand) {
    debugLogger.error('No diff tool available. Install a supported editor.');
    return;
  }

  if (isTerminalEditor(editor)) {
    try {
      const result = spawnSync(diffCommand.command, diffCommand.args, {
        stdio: 'inherit',
      });
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        throw new Error(`${editor} exited with code ${result.status}`);
      }
    } finally {
      coreEvents.emit(CoreEvent.ExternalEditorClosed);
    }
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const childProcess = spawn(diffCommand.command, diffCommand.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    // Guard against both 'error' and 'close' firing for a single failure,
    // which would emit ExternalEditorClosed twice and attempt to settle
    // the promise twice.
    let isSettled = false;

    childProcess.on('close', (code) => {
      if (isSettled) return;
      isSettled = true;

      if (code !== 0) {
        // GUI editors (VS Code, Zed, etc.) can exit with non-zero codes
        // under normal circumstances (e.g., window closed while loading).
        // Log a warning instead of crashing the CLI process.
        debugLogger.warn(`${editor} exited with code ${code}`);
      }
      coreEvents.emit(CoreEvent.ExternalEditorClosed);
      resolve();
    });

    childProcess.on('error', (error) => {
      if (isSettled) return;
      isSettled = true;

      coreEvents.emit(CoreEvent.ExternalEditorClosed);
      reject(error);
    });
  });
}
