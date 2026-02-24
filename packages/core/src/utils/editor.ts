/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, spawn, spawnSync, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { debugLogger } from './debugLogger.js';
import { coreEvents, CoreEvent, type EditorSelectedPayload } from './events.js';
import type { DiffUpdateResult } from '../ide/ide-client.js';

const execAsync = promisify(exec);

/**
 * Interface for an object that can open a diff in an IDE.
 * Decouples editor utility from IdeClient implementation to avoid circular dependencies.
 */
export interface OpenFileIdeClient {
  isDiffingEnabled(): boolean;
  openDiff(filePath: string, content: string): Promise<DiffUpdateResult>;
}

export interface OpenFileInEditorOptions {
  preferredEditor?: EditorType;
  ideClient?: OpenFileIdeClient;
  readTextFile?: (path: string) => Promise<string>;
  writeTextFile?: (path: string, content: string) => Promise<void>;
}

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

export const NO_EDITOR_AVAILABLE_ERROR =
  'No external editor is available. Please run /editor to configure one.';

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

export function isValidEditorType(editor: string): editor is EditorType {
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

function getEditorCommands(editor: EditorType): string[] {
  const commandConfig = editorCommands[editor];
  return process.platform === 'win32'
    ? commandConfig.win32
    : commandConfig.default;
}

export function hasValidEditorCommand(editor: EditorType): boolean {
  return getEditorCommands(editor).some((cmd) => commandExists(cmd));
}

export async function hasValidEditorCommandAsync(
  editor: EditorType,
): Promise<boolean> {
  const results = await Promise.allSettled(
    getEditorCommands(editor).map((cmd) => commandExistsAsync(cmd)),
  );
  return results.some((r) => r.status === 'fulfilled' && r.value);
}

export function getEditorCommand(editor: EditorType): string {
  const commands = getEditorCommands(editor);
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

/**
 * Opens a file in an editor.
 * If an IDE client is provided and connected, it uses openDiff for an integrated experience.
 * Otherwise, it falls back to external editors (GUI or Terminal).
 */
export async function openFileInEditor(
  filePath: string,
  options: OpenFileInEditorOptions = {},
): Promise<{ modified: boolean }> {
  const { ideClient, preferredEditor, readTextFile, writeTextFile } = options;

  // 1. Try IDE Flow
  if (ideClient?.isDiffingEnabled() && readTextFile && writeTextFile) {
    debugLogger.debug(`openFileInEditor: Using IDE flow for ${filePath}`);
    try {
      const currentContent = await readTextFile(filePath);
      const result = await ideClient.openDiff(filePath, currentContent);
      if (result.status === 'accepted' && result.content !== undefined) {
        if (result.content !== currentContent) {
          await writeTextFile(filePath, result.content);
          return { modified: true };
        }
      }
      return { modified: false };
    } catch (err) {
      debugLogger.error(
        'openFileInEditor: IDE flow failed, falling back:',
        err,
      );
      // Fall through to external editor
    }
  }

  // 2. Resolve external editor command
  let command: string | undefined = undefined;
  const args = [filePath];

  if (preferredEditor) {
    command = getEditorCommand(preferredEditor);
    if (isGuiEditor(preferredEditor)) {
      args.unshift('--wait');
    }
  }

  if (!command) {
    command =
      process.env['VISUAL'] ??
      process.env['EDITOR'] ??
      (process.platform === 'win32' ? 'notepad' : 'vim');
  }

  // DEFINITIVE FIX for Vim E138: Always add -i NONE when we detect vim/nvim
  const commandBase = command.toLowerCase();
  if (commandBase.includes('vim') || commandBase.includes('nvim')) {
    args.unshift('-i', 'NONE');
  }

  const useGuiSpawn = preferredEditor && isGuiEditor(preferredEditor);
  debugLogger.debug(
    `openFileInEditor: Using external editor: ${command} ${args.join(' ')} (GUI spawn: ${useGuiSpawn})`,
  );

  const initialContent = readTextFile
    ? await readTextFile(filePath).catch(() => undefined)
    : undefined;

  return new Promise<{ modified: boolean }>((resolve, reject) => {
    const wasRaw = process.stdin.isRaw;
    if (!useGuiSpawn && wasRaw) {
      process.stdin.setRawMode(false);
    }

    const onExit = async (status: number | null, error?: Error) => {
      if (!useGuiSpawn && wasRaw) {
        process.stdin.setRawMode(true);
      }
      coreEvents.emit(CoreEvent.ExternalEditorClosed);

      if (error) {
        reject(error);
      } else if (status !== null && status !== 0) {
        reject(new Error(`Editor exited with status ${status}`));
      } else {
        if (readTextFile) {
          try {
            const finalContent = await readTextFile(filePath);
            resolve({ modified: initialContent !== finalContent });
          } catch (err) {
            debugLogger.error(
              `openFileInEditor: Failed to read file after editor exit: ${filePath}`,
              err,
            );
            // Fallback to true if we can't read the file but it existed or was supposed to
            resolve({ modified: true });
          }
        } else {
          // Assume modified if external editor was used and closed successfully
          resolve({ modified: true });
        }
      }
    };

    if (useGuiSpawn) {
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      child.on('close', (code) => {
        void onExit(code);
      });
      child.on('error', (err) => {
        void onExit(null, err);
      });
    } else {
      try {
        const result = spawnSync(command, args, {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        void onExit(result.status, result.error || undefined);
      } catch (err: unknown) {
        void onExit(null, err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}
