/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn } from 'child_process';

export type EditorType =
  | 'vscode'
  | 'windsurf'
  | 'cursor'
  | 'vim'
  | 'zed'
  | 'editor';

function isValidEditorType(editor: string): editor is EditorType {
  return ['vscode', 'windsurf', 'cursor', 'vim', 'zed', 'editor'].includes(
    editor,
  );
}

interface DiffCommand {
  command: string;
  args: string[];
}

function commandExists(cmd: string): boolean {
  try {
    execSync(
      process.platform === 'win32' ? `where.exe ${cmd}` : `command -v ${cmd}`,
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

const editorCommands: Record<
  Exclude<EditorType, 'editor'>,
  { win32: string; default: string }
> = {
  vscode: { win32: 'code.cmd', default: 'code' },
  windsurf: { win32: 'windsurf', default: 'windsurf' },
  cursor: { win32: 'cursor', default: 'cursor' },
  vim: { win32: 'vim', default: 'vim' },
  zed: { win32: 'zed', default: 'zed' },
};

export function checkHasEditorType(editor: EditorType): boolean {
  if (editor === 'editor') {
    // Check VISUAL first, then EDITOR (following Unix conventions)
    const editorCmd = process.env.VISUAL || process.env.EDITOR;
    if (!editorCmd) {
      return false;
    }
    // Extract just the command name (first word) for checking
    const command = editorCmd.split(' ')[0];
    return commandExists(command);
  }
  const commandConfig = editorCommands[editor as Exclude<EditorType, 'editor'>];
  const command =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return commandExists(command);
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env.SANDBOX;
  if (['vscode', 'windsurf', 'cursor', 'zed'].includes(editor)) {
    return notUsingSandbox;
  }
  // Allow editor type in sandbox (assumes it's likely a terminal editor)
  return true;
}

/**
 * Check if the editor is valid and can be used.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 */
export function isEditorAvailable(editor: string | undefined): boolean {
  if (editor && isValidEditorType(editor)) {
    return (
      checkHasEditorType(editor as EditorType) &&
      allowEditorTypeInSandbox(editor as EditorType)
    );
  }
  return false;
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

  let command: string;
  if (editor === 'editor') {
    // For editor type, we don't use editorCommands - handle separately
    command = '';
  } else {
    const commandConfig =
      editorCommands[editor as Exclude<EditorType, 'editor'>];
    command =
      process.platform === 'win32'
        ? commandConfig.win32
        : commandConfig.default;
  }
  switch (editor) {
    case 'vscode':
    case 'windsurf':
    case 'cursor':
    case 'zed':
      return { command, args: ['--wait', '--diff', oldPath, newPath] };
    case 'vim':
      return {
        command: 'vim',
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
          'autocmd WinClosed * wqa',
          oldPath,
          newPath,
        ],
      };
    case 'editor': {
      // Use VISUAL first, then EDITOR environment variable with appropriate diff handling
      const editorCmd = process.env.VISUAL || process.env.EDITOR;
      if (!editorCmd) {
        return null;
      }
      const parts = editorCmd.split(' ');
      const editorCommand = parts[0];
      const editorArgs = parts.slice(1);
      const editorName = editorCommand.toLowerCase();

      // Handle different editors' diff modes
      if (
        editorName.includes('vim') ||
        editorName.includes('nvim') ||
        editorName === 'vi'
      ) {
        // Vim-style diff mode
        return {
          command: editorCommand,
          args: [
            ...editorArgs,
            '-d',
            '-i',
            'NONE',
            '-c',
            'wincmd h | set readonly | wincmd l',
            '-c',
            'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
            '-c',
            'set showtabline=2 | set tabline=[Instructions]\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'wincmd h | setlocal statusline=OLD\\ FILE',
            '-c',
            'wincmd l | setlocal statusline=%#StatusBold#NEW\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ i/esc(toggle\\ edit\\ mode)',
            '-c',
            'autocmd WinClosed * wqa',
            oldPath,
            newPath,
          ],
        };
      } else if (editorName.includes('emacs')) {
        // Emacs - just open both files
        return {
          command: editorCommand,
          args: [...editorArgs, oldPath, newPath],
        };
      } else if (editorName === 'hx' || editorName.includes('helix')) {
        // Helix doesn't have built-in diff mode, open side by side
        return {
          command: editorCommand,
          args: [...editorArgs, '--vsplit', oldPath, newPath],
        };
      } else {
        // Default: just open the new file for editing (most editors)
        return {
          command: editorCommand,
          args: [...editorArgs, newPath],
        };
      }
    }
    default:
      return null;
  }
}

/**
 * Opens a diff tool to compare two files.
 * Terminal-based editors by default blocks parent process until the editor exits.
 * GUI-based editors requires args such as "--wait" to block parent process.
 */
export async function openDiff(
  oldPath: string,
  newPath: string,
  editor: EditorType,
): Promise<void> {
  const diffCommand = getDiffCommand(oldPath, newPath, editor);
  if (!diffCommand) {
    console.error('No diff tool available. Install a supported editor.');
    return;
  }

  try {
    switch (editor) {
      case 'vscode':
      case 'windsurf':
      case 'cursor':
      case 'zed':
        // Use spawn for GUI-based editors to avoid blocking the entire process
        return new Promise((resolve, reject) => {
          const childProcess = spawn(diffCommand.command, diffCommand.args, {
            stdio: 'inherit',
            shell: true,
          });

          childProcess.on('close', (code: number) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`${editor} exited with code ${code}`));
            }
          });

          childProcess.on('error', (error: Error) => {
            reject(error);
          });
        });

      case 'vim': {
        // Use execSync for terminal-based editors
        const command =
          process.platform === 'win32'
            ? `${diffCommand.command} ${diffCommand.args.join(' ')}`
            : `${diffCommand.command} ${diffCommand.args
                .map((arg) => `"${arg}"`)
                .join(' ')}`;
        execSync(command, {
          stdio: 'inherit',
          encoding: 'utf8',
        });
        break;
      }

      case 'editor': {
        // Handle VISUAL/EDITOR environment variable with proper execution strategy
        const editorCmd = process.env.VISUAL || process.env.EDITOR;
        if (!editorCmd) {
          throw new Error('VISUAL or EDITOR environment variable not set');
        }
        const editorName = editorCmd.split(' ')[0].toLowerCase();

        // Use spawn for GUI editors that might support --wait or similar
        if (editorName.includes('emacs') && !editorCmd.includes('-nw')) {
          // GUI Emacs - use spawn
          return new Promise((resolve, reject) => {
            const childProcess = spawn(diffCommand.command, diffCommand.args, {
              stdio: 'inherit',
              shell: true,
            });

            childProcess.on('close', (code: number) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`${editorName} exited with code ${code}`));
              }
            });

            childProcess.on('error', (error: Error) => {
              reject(error);
            });
          });
        } else {
          // Terminal-based editors or editors without GUI mode - use execSync
          const command =
            process.platform === 'win32'
              ? `${diffCommand.command} ${diffCommand.args.join(' ')}`
              : `${diffCommand.command} ${diffCommand.args
                  .map((arg) => `"${arg}"`)
                  .join(' ')}`;
          execSync(command, {
            stdio: 'inherit',
            encoding: 'utf8',
          });
        }
        break;
      }

      default:
        throw new Error(`Unsupported editor: ${editor}`);
    }
  } catch (error) {
    console.error(error);
  }
}
