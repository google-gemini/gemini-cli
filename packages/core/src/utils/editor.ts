/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, execSync, spawn, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { debugLogger } from './debugLogger.js';
import { coreEvents, CoreEvent } from './events.js';

const GUI_EDITORS = [
  'vscode',
  'vscodium',
  'windsurf',
  'cursor',
  'zed',
  'antigravity',
] as const;
const TERMINAL_EDITORS = ['vim', 'neovim', 'emacs', 'hx'] as const;
const EDITORS = [...GUI_EDITORS, ...TERMINAL_EDITORS] as const;

const GUI_EDITORS_SET = new Set<string>(GUI_EDITORS);
const TERMINAL_EDITORS_SET = new Set<string>(TERMINAL_EDITORS);
const EDITORS_SET = new Set<string>(EDITORS);

export const DEFAULT_GUI_EDITOR: GuiEditorType = 'vscode';

export type GuiEditorType = (typeof GUI_EDITORS)[number];
export type TerminalEditorType = (typeof TERMINAL_EDITORS)[number];
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
  EditorType,
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

export function checkHasEditorType(editor: EditorType): boolean {
  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return commands.some((cmd) => commandExists(cmd));
}

export async function checkHasEditorTypeAsync(
  editor: EditorType,
): Promise<boolean> {
  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  for (const cmd of commands) {
    if (await commandExistsAsync(cmd)) {
      return true;
    }
  }
  return false;
}

export function getEditorCommand(editor: EditorType): string {
  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return (
    commands.slice(0, -1).find((cmd) => commandExists(cmd)) ||
    commands[commands.length - 1]
  );
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env['SANDBOX'];
  if (isGuiEditor(editor)) {
    return notUsingSandbox;
  }
  // For terminal-based editors like vim and emacs, allow in sandbox.
  return true;
}

/**
 * Check if the editor is valid and can be used.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 */
export function isEditorAvailable(editor: string | undefined): boolean {
  if (editor && isValidEditorType(editor)) {
    return checkHasEditorType(editor) && allowEditorTypeInSandbox(editor);
  }
  return false;
}

/**
 * Async version of isEditorAvailable.
 * Check if the editor is valid and can be used without blocking the event loop.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 */
export async function isEditorAvailableAsync(
  editor: string | undefined,
): Promise<boolean> {
  if (editor && isValidEditorType(editor)) {
    return (
      (await checkHasEditorTypeAsync(editor)) &&
      allowEditorTypeInSandbox(editor)
    );
  }
  return false;
}

/**
 * Detects the first available editor from the supported list.
 * Prioritizes terminal editors (vim, neovim, emacs, hx) as they work in all environments
 * including sandboxed mode, then falls back to GUI editors.
 * Returns undefined if no supported editor is found.
 */
export function detectFirstAvailableEditor(): EditorType | undefined {
  // Prioritize terminal editors as they work in sandbox mode
  for (const editor of TERMINAL_EDITORS) {
    if (isEditorAvailable(editor)) {
      return editor;
    }
  }
  // Fall back to GUI editors (won't work in sandbox mode but checked above)
  for (const editor of GUI_EDITORS) {
    if (isEditorAvailable(editor)) {
      return editor;
    }
  }
  return undefined;
}

/**
 * Async version of detectFirstAvailableEditor.
 * Detects the first available editor from the supported list without blocking the event loop.
 * Prioritizes terminal editors (vim, neovim, emacs, hx) as they work in all environments
 * including sandboxed mode, then falls back to GUI editors.
 * Returns undefined if no supported editor is found.
 */
export async function detectFirstAvailableEditorAsync(): Promise<
  EditorType | undefined
> {
  // Prioritize terminal editors as they work in sandbox mode
  for (const editor of TERMINAL_EDITORS) {
    if (await isEditorAvailableAsync(editor)) {
      return editor;
    }
  }
  // Fall back to GUI editors (won't work in sandbox mode but checked above)
  for (const editor of GUI_EDITORS) {
    if (await isEditorAvailableAsync(editor)) {
      return editor;
    }
  }
  return undefined;
}

/**
 * Result of attempting to resolve an editor for use.
 */
export interface EditorResolutionResult {
  /** The editor to use, if available */
  editor?: EditorType;
  /** Error message if no editor is available */
  error?: string;
}

/**
 * Resolves an editor to use for external editing.
 * 1. If a preferred editor is set and available, uses it.
 * 2. If a preferred editor is set but not available, returns an error.
 * 3. If no preferred editor is set, attempts to auto-detect an available editor.
 * 4. If no editor can be found, returns an error with instructions.
 *
 * @deprecated Use resolveEditorAsync instead to avoid blocking the event loop.
 */
export function resolveEditor(
  preferredEditor: EditorType | undefined,
): EditorResolutionResult {
  // Case 1: Preferred editor is set
  if (preferredEditor) {
    if (isEditorAvailable(preferredEditor)) {
      return { editor: preferredEditor };
    }
    // Preferred editor is set but not available
    const displayName = getEditorDisplayName(preferredEditor);
    if (!checkHasEditorType(preferredEditor)) {
      return {
        error: `${displayName} is configured as your preferred editor but is not installed. Please install it or run /editor to choose a different editor.`,
      };
    }
    // If the editor is installed but not available, it must be due to sandbox restrictions.
    return {
      error: `${displayName} cannot be used in sandbox mode. Please run /editor to choose a terminal-based editor (vim, neovim, emacs, or helix).`,
    };
  }

  // Case 2: No preferred editor set, try to auto-detect
  const detectedEditor = detectFirstAvailableEditor();
  if (detectedEditor) {
    return { editor: detectedEditor };
  }

  // Case 3: No editor available at all
  return {
    error:
      'No external editor is configured or available. Please run /editor to set your preferred editor, or install one of the supported editors: vim, neovim, emacs, helix, VS Code, Cursor, Zed, or Windsurf.',
  };
}

/**
 * Async version of resolveEditor.
 * Resolves an editor to use for external editing without blocking the event loop.
 * 1. If a preferred editor is set and available, uses it.
 * 2. If a preferred editor is set but not available, returns an error.
 * 3. If no preferred editor is set, attempts to auto-detect an available editor.
 * 4. If no editor can be found, returns an error with instructions.
 */
export async function resolveEditorAsync(
  preferredEditor: EditorType | undefined,
): Promise<EditorResolutionResult> {
  // Case 1: Preferred editor is set
  if (preferredEditor) {
    if (await isEditorAvailableAsync(preferredEditor)) {
      return { editor: preferredEditor };
    }
    // Preferred editor is set but not available
    const displayName = getEditorDisplayName(preferredEditor);
    if (!(await checkHasEditorTypeAsync(preferredEditor))) {
      return {
        error: `${displayName} is configured as your preferred editor but is not installed. Please install it or run /editor to choose a different editor.`,
      };
    }
    // If the editor is installed but not available, it must be due to sandbox restrictions.
    return {
      error: `${displayName} cannot be used in sandbox mode. Please run /editor to choose a terminal-based editor (vim, neovim, emacs, or helix).`,
    };
  }

  // Case 2: No preferred editor set, try to auto-detect
  const detectedEditor = await detectFirstAvailableEditorAsync();
  if (detectedEditor) {
    return { editor: detectedEditor };
  }

  // Case 3: No editor available at all
  return {
    error:
      'No external editor is configured or available. Please run /editor to set your preferred editor, or install one of the supported editors: vim, neovim, emacs, helix, VS Code, Cursor, Zed, or Windsurf.',
  };
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

    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${editor} exited with code ${code}`));
      }
    });

    childProcess.on('error', (error) => {
      reject(error);
    });
  });
}
