/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn } from 'child_process';

type EditorType = 'vscode' | 'vim';

interface DiffCommand {
  command: string;
  args: string[];
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function checkHasEditor(editor: EditorType): boolean {
  if (editor === 'vscode') {
    return commandExists('code');
  } else if (editor === 'vim') {
    return commandExists('vim');
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
  switch (editor) {
    case 'vscode':
      return {
        command: 'code',
        args: ['--wait', '--diff', oldPath, newPath],
      };
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
    console.error('No diff tool available. Install vim or vscode.');
    return;
  }

  try {
    if (editor === 'vscode') {
      // Use spawn to avoid blocking the entire process, resolve this function when editor is closed.
      return new Promise((resolve, reject) => {
        const process = spawn(diffCommand.command, diffCommand.args, {
          stdio: 'inherit',
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`VS Code exited with code ${code}`));
          }
        });

        process.on('error', (error) => {
          reject(error);
        });
      });
    } else {
      // Use execSync for terminal-based editors like vim
      const command = `${diffCommand.command} ${diffCommand.args.map((arg) => `"${arg}"`).join(' ')}`;
      execSync(command, {
        stdio: 'inherit',
        encoding: 'utf8',
      });
    }
  } catch (error) {
    console.error(error);
  }
}
