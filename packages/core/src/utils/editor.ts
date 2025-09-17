/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn, spawnSync } from 'node:child_process';

export type EditorType =
  | 'vscode'
  | 'vscodium'
  | 'windsurf'
  | 'cursor'
  | 'vim'
  | 'neovim'
  | 'zed'
  | 'emacs'
  | 'vscode-insiders'
  | 'pycharm'
  | 'sublime'
  | 'nano'
  | 'custom';

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
    'vscode-insiders',
    'pycharm',
    'sublime',
    'nano',
    'custom',
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
    // On macOS, also check common installation locations outside PATH
    if (process.platform === 'darwin') {
      return checkMacOSAppExists(cmd);
    }
    return false;
  }
}

/**
 * Check for macOS applications that might not be in PATH.
 */
function checkMacOSAppExists(cmd: string): boolean {
  // Map common editor commands to their macOS application paths
  const macApps: Record<string, string[]> = {
    'code': [
      '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      '/usr/local/bin/code',
    ],
    'cursor': [
      '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
      '/usr/local/bin/cursor',
    ],
    'zed': [
      '/Applications/Zed.app/Contents/MacOS/zed',
      '/usr/local/bin/zed',
    ],
    'pycharm': [
      '/Applications/PyCharm.app/Contents/MacOS/pycharm',
      '/usr/local/bin/pycharm',
    ],
    'subl': [
      '/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl',
      '/usr/local/bin/subl',
    ],
  };

  const possiblePaths = macApps[cmd];
  if (possiblePaths) {
    return possiblePaths.some(path => {
      try {
        execSync(`test -x "${path}"`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    });
  }

  return false;
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
  'vscode-insiders': { win32: ['code-insiders.cmd'], default: ['code-insiders'] },
  pycharm: { win32: ['pycharm.exe'], default: ['pycharm'] },
  sublime: { win32: ['subl.exe'], default: ['subl'] },
  nano: { win32: ['nano.exe'], default: ['nano'] },
  custom: { win32: [], default: [] }, // Will be determined from EDITOR/VISUAL env vars
};

export function checkHasEditorType(editor: EditorType): boolean {
  // Special handling for custom editor from environment variables
  if (editor === 'custom') {
    const customEditor = getCustomEditorFromEnv();
    return customEditor !== null && commandExists(customEditor);
  }

  const commandConfig = editorCommands[editor];
  const commands =
    process.platform === 'win32' ? commandConfig.win32 : commandConfig.default;
  return commands.some((cmd) => commandExists(cmd));
}

/**
 * Get custom editor command from EDITOR/VISUAL environment variables.
 */
export function getCustomEditorFromEnv(): string | null {
  // Check VISUAL first (preferred for visual editors), then EDITOR
  const editorCmd = process.env['VISUAL'] || process.env['EDITOR'];
  if (editorCmd) {
    // Extract the command name (handle full paths and arguments)
    const cmd = editorCmd.split(' ')[0].split('/').pop()?.split('\\').pop();
    return cmd || null;
  }
  return null;
}

export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const notUsingSandbox = !process.env['SANDBOX'];
  // GUI-based editors that might have security implications in sandbox
  if (['vscode', 'vscodium', 'windsurf', 'cursor', 'zed', 'vscode-insiders', 'pycharm', 'sublime'].includes(editor)) {
    return notUsingSandbox;
  }
  // For terminal-based editors and custom editors, allow in sandbox
  return true;
}

/**
 * Detect the best available editor from environment variables and common editors.
 */
export function detectBestEditor(): EditorType | null {
  // First, try to detect from EDITOR/VISUAL environment variables
  const customEditor = getCustomEditorFromEnv();
  if (customEditor && commandExists(customEditor)) {
    return 'custom';
  }

  // Then try known editors in order of preference
  const preferredEditors: EditorType[] = [
    'cursor',        // Most popular in this environment
    'vscode',
    'vscode-insiders',
    'zed',
    'windsurf',
    'vscodium',
    'pycharm',
    'sublime',
    'vim',
    'neovim',
    'emacs',
    'nano',
  ];

  for (const editor of preferredEditors) {
    if (checkHasEditorType(editor) && allowEditorTypeInSandbox(editor)) {
      return editor;
    }
  }

  return null;
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
    case 'vscode-insiders':
    case 'zed':
      return { command, args: ['--wait', '--diff', oldPath, newPath] };
    case 'pycharm':
      // PyCharm diff command
      return { command, args: ['diff', oldPath, newPath] };
    case 'sublime':
      // Sublime Text diff command
      return { command, args: ['--new-window', '--command', 'diff_files', `{"files": ["${oldPath}", "${newPath}"]}`] };
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
    case 'nano':
      // Nano doesn't have built-in diff support, fall back to vimdiff
      const vimCmd = process.platform === 'win32' ? 'vim' : 'vim';
      if (commandExists(vimCmd)) {
        return {
          command: vimCmd,
          args: ['-d', oldPath, newPath],
        };
      }
      return null;
    case 'custom':
      // For custom editors, try to detect from environment
      const customCmd = getCustomEditorFromEnv();
      if (customCmd) {
        return { command: customCmd, args: [oldPath] };
      }
      return null;
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
  onEditorClose: () => void,
): Promise<void> {
  const diffCommand = getDiffCommand(oldPath, newPath, editor);
  if (!diffCommand) {
    console.error('No diff tool available. Install a supported editor.');
    return;
  }

  try {
    const isTerminalEditor = ['vim', 'emacs', 'neovim', 'nano'].includes(editor);

    if (isTerminalEditor) {
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
        onEditorClose();
      }
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const childProcess = spawn(diffCommand.command, diffCommand.args, {
        stdio: 'inherit',
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
  } catch (error) {
    console.error(error);
    throw error;
  }
}
