/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as os from 'node:os';
import { execSync, spawn } from 'node:child_process';

export type EditorType =
  | 'vscode'
  | 'vscodium'
  | 'windsurf'
  | 'cursor'
  | 'vim'
  | 'neovim'
  | 'zed'
  | 'emacs'
  | 'GeminiEditor';

function isValidEditorType(editor: string): editor is EditorType {
  return [
    'vscode',
    'vscodium',
    'windsurf',
    'cursor',
    'vim',
    'neovim',
    'zed',
    'emacs',
    'GeminiEditor',
  ].includes(editor);
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
  GeminiEditor: { win32: [], default: [] },
};

export function checkHasEditorType(editor: EditorType): boolean {
  if (editor === 'GeminiEditor') {
    return process.env['GEMINI_CLI_CONTEXT'] === 'electron';
  }
  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return commands.some((cmd) => commandExists(cmd));
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env['SANDBOX'];
  if (['vscode', 'vscodium', 'windsurf', 'cursor', 'zed'].includes(editor)) {
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
  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  const command =
    commands.slice(0, -1).find((cmd) => commandExists(cmd)) ||
    commands[commands.length - 1];

  switch (editor) {
    case 'vscode':
    case 'vscodium':
    case 'windsurf':
    case 'cursor':
    case 'zed':
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
        args: ['--eval', `(ediff "${oldPath}" "${newPath}")`],
      };
    default:
      return null;
  }
}

async function openDiffGeminiEditor(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const diffId = process.env['GEMINI_SESSION_ID'];
  if (!diffId) {
    throw new Error('GEMINI_SESSION_ID environment variable not set.');
  }
  const diffDir = path.join(os.homedir(), '.gemini', 'tmp', 'diff', diffId);
  await fs.mkdir(diffDir, { recursive: true });

  try {
    const oldContent = await fs.readFile(oldPath, 'utf-8');
    const newContent = await fs.readFile(newPath, 'utf-8');
    const fileType = path.extname(newPath);

    await fs.writeFile(path.join(diffDir, `old${fileType}`), oldContent);
    await fs.writeFile(path.join(diffDir, `new${fileType}`), newContent);

    const meta = { filePath: newPath };
    await fs.writeFile(path.join(diffDir, 'meta.json'), JSON.stringify(meta));

    // Signal to the Electron app that the files are ready.
    console.log(`GEMINI_EDITOR_REQUEST:${diffDir}`);

    const responsePath = path.join(diffDir, 'response.json');

    const waitForResponse = (): Promise<{
      status: 'approve' | 'reject';
      content?: string;
    }> =>
      new Promise((resolve, reject) => {
        // This timeout is to prevent the process from hanging forever if the GUI doesn't respond.
        const timeout = setTimeout(() => {
          clearInterval(interval);
          reject(new Error('Timeout waiting for editor response.'));
        }, 300000); // 5 minutes timeout

        const interval = setInterval(async () => {
          try {
            await fs.access(responsePath);
            clearInterval(interval);
            clearTimeout(timeout);
            const responseContent = await fs.readFile(responsePath, 'utf-8');
            const response = JSON.parse(responseContent);

            if (response.status === 'approve') {
              const updatedContent = await fs.readFile(
                path.join(diffDir, `new${fileType}`),
                'utf-8',
              );
              resolve({ status: 'approve', content: updatedContent });
            } else {
              resolve({ status: 'reject' });
            }
          } catch (e) {
            const error = e as NodeJS.ErrnoException;
            if (error.code !== 'ENOENT') {
              clearInterval(interval);
              clearTimeout(timeout);
              reject(error);
            }
            // else, file not found, continue polling.
          }
        }, 500);
      });

    const response = await waitForResponse();

    if (response.status === 'approve' && response.content) {
      await fs.writeFile(newPath, response.content);
    } else if (response.status === 'reject') {
      // Do nothing, just exit gracefully.
      return;
    } else {
      throw new Error('Changes rejected by user.');
    }
  } finally {
    await fs.rm(diffDir, { recursive: true, force: true });
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
  onEditorClose: () => void,
): Promise<void> {
  if (editor === 'GeminiEditor') {
    if (process.env['GEMINI_CLI_CONTEXT'] === 'electron') {
      return openDiffGeminiEditor(oldPath, newPath);
    } else {
      // Fallback for non-electron environments
      const fallbackEditor = process.env['EDITOR'] || 'vim';
      if (isValidEditorType(fallbackEditor)) {
        return openDiff(oldPath, newPath, fallbackEditor, onEditorClose);
      } else {
        console.error(
          'GeminiEditor is only available in the Electron app. Please configure a different editor.',
        );
        return;
      }
    }
  }

  const diffCommand = getDiffCommand(oldPath, newPath, editor);
  if (!diffCommand) {
    console.error('No diff tool available. Install a supported editor.');
    return;
  }

  try {
    switch (editor) {
      case 'vscode':
      case 'vscodium':
      case 'windsurf':
      case 'cursor':
      case 'zed':
        // Use spawn for GUI-based editors to avoid blocking the entire process
        return new Promise((resolve, reject) => {
          const childProcess = spawn(diffCommand.command, diffCommand.args, {
            stdio: 'inherit',
            shell: true,
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

      case 'vim':
      case 'emacs':
      case 'neovim': {
        // Use execSync for terminal-based editors
        const command =
          process.platform === 'win32'
            ? `${diffCommand.command} ${diffCommand.args.join(' ')}`
            : `${diffCommand.command} ${diffCommand.args.map((arg) => `"${arg}"`).join(' ')}`;
        try {
          execSync(command, {
            stdio: 'inherit',
            encoding: 'utf8',
          });
        } catch (e) {
          console.error('Error in onEditorClose callback:', e);
        } finally {
          onEditorClose();
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
