/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync, spawn, SpawnOptions } from 'child_process';
import { resolve } from 'path'; // For resolving paths

// --- Interfaces and Types ---

export type EditorType =
  | 'vscode'
  | 'vscodium'
  | 'windsurf'
  | 'cursor'
  | 'vim'
  | 'neovim'
  | 'zed'
  | 'vscode-insiders'; // Added vscode-insiders

interface EditorPlatformCommands {
  win32: string;
  darwin?: string; // macOS specific command if different
  linux?: string; // Linux specific command if different
  default: string; // Fallback for other platforms or if platform-specific not found
}

interface EditorConfig {
  commands: EditorPlatformCommands;
  sandboxCompatible: boolean;
  getDiffArgs: (oldPath: string, newPath: string, wait: boolean) => string[];
  isGUI: boolean; // Indicates if the editor is GUI-based or terminal-based
}

export interface DiffCommand {
  command: string;
  args: string[];
  isGUI: boolean;
}

// --- Utility Functions ---

/**
 * Checks if a command exists in the system's PATH.
 * @param cmd The command to check.
 * @returns True if the command exists, false otherwise.
 */
function commandExists(cmd: string): boolean {
  try {
    const platformCommand =
      process.platform === 'win32' ? `where.exe ${cmd}` : `command -v ${cmd}`;
    execSync(platformCommand, { stdio: 'ignore' });
    if (process.env.DEBUG) {
      console.log(`DEBUG: Command '${cmd}' exists.`);
    }
    return true;
  } catch (error) {
    if (process.env.DEBUG) {
      console.error(
        `DEBUG: Command '${cmd}' does not exist. Error: ${error.message}`,
      );
    }
    return false;
  }
}

/**
 * Resolves the appropriate command for the current platform.
 * @param commands EditorPlatformCommands object.
 * @returns The command string for the current platform.
 */
function resolveEditorCommand(commands: EditorPlatformCommands): string {
  switch (process.platform) {
    case 'win32':
      return commands.win32;
    case 'darwin':
      return commands.darwin || commands.default;
    case 'linux':
      return commands.linux || commands.default;
    default:
      return commands.default;
  }
}

// --- Editor Configurations ---

const editorConfigs: Map<EditorType, EditorConfig> = new Map([
  [
    'vscode',
    {
      commands: { win32: 'code.cmd', default: 'code' },
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
  [
    'vscode-insiders', // Added vscode-insiders
    {
      commands: { win32: 'code-insiders.cmd', default: 'code-insiders' },
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
  [
    'vscodium',
    {
      commands: { win32: 'codium.cmd', default: 'codium' },
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
  [
    'windsurf',
    {
      commands: { win32: 'windsurf', default: 'windsurf' },
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
  [
    'cursor',
    {
      commands: { win32: 'cursor', default: 'cursor' },
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
  [
    'vim',
    {
      commands: { win32: 'vim.exe', default: 'vim' }, // Use vim.exe for clarity on Windows
      sandboxCompatible: true, // Terminal editors generally are sandbox compatible
      getDiffArgs: (oldPath, newPath) => [
        '-d',
        '-i',
        'NONE', // Skip viminfo file to avoid E138 errors
        '-c',
        'wincmd h | setlocal buftype=nowrite bufhidden=wipe nomodifiable | wincmd l | setlocal nomodifiable', // Make both windows read-only by default for diffs, better for review
        '-c',
        'autocmd BufEnter <buffer> setlocal nomodifiable', // Ensure buffers remain nomodifiable
        // Neon colorization themed diffs 😻
        '-c',
        'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
        '-c',
        'set showtabline=2', // Always show tabline
        '-c',
        `set tabline=[Diff\\ Mode]\\ OLD\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ NEW\\ FILE\\ :wqa(save\\ &\\ quit)`, // Clearer tabline
        '-c',
        'autocmd WinClosed * wqa', // Auto close all windows when one is closed
        oldPath,
        newPath,
      ],
      isGUI: false,
    },
  ],
  [
    'neovim',
    {
      commands: { win32: 'nvim.exe', default: 'nvim' }, // Use nvim.exe for clarity on Windows
      sandboxCompatible: true,
      getDiffArgs: (oldPath, newPath) => [
        '-d',
        '-i',
        'NONE', // Skip viminfo file to avoid E138 errors
        '-c',
        'wincmd h | setlocal buftype=nowrite bufhidden=wipe nomodifiable | wincmd l | setlocal nomodifiable', // Make both windows read-only by default for diffs, better for review
        '-c',
        'autocmd BufEnter <buffer> setlocal nomodifiable', // Ensure buffers remain nomodifiable
        // Neon colorization themed diffs 😻
        '-c',
        'highlight DiffAdd cterm=bold ctermbg=22 guibg=#005f00 | highlight DiffChange cterm=bold ctermbg=24 guibg=#005f87 | highlight DiffText ctermbg=21 guibg=#0000af | highlight DiffDelete ctermbg=52 guibg=#5f0000',
        '-c',
        'set showtabline=2', // Always show tabline
        '-c',
        `set tabline=[Diff\\ Mode]\\ OLD\\ FILE\\ :wqa(save\\ &\\ quit)\\ \\|\\ NEW\\ FILE\\ :wqa(save\\ &\\ quit)`, // Clearer tabline
        '-c',
        'autocmd WinClosed * wqa', // Auto close all windows when one is closed
        oldPath,
        newPath,
      ],
      isGUI: false,
    },
  ],
  [
    'zed',
    {
      commands: { win32: 'zed', default: 'zed' }, // Assume 'zed' is in PATH for Windows if used
      sandboxCompatible: false,
      getDiffArgs: (oldPath, newPath, wait) =>
        wait
          ? ['--wait', '--diff', oldPath, newPath]
          : ['--diff', oldPath, newPath],
      isGUI: true,
    },
  ],
]);

/**
 * Checks if a given editor type is valid and supported.
 * @param editor The editor type string.
 * @returns True if the editor type is valid, false otherwise.
 */
export function isValidEditorType(editor: string): editor is EditorType {
  return editorConfigs.has(editor as EditorType);
}

/**
 * Checks if the specified editor command exists in the system's PATH.
 * @param editor The editor type to check.
 * @returns True if the editor's command is found, false otherwise.
 */
export function checkHasEditorType(editor: EditorType): boolean {
  const config = editorConfigs.get(editor);
  if (!config) {
    return false;
  }
  const command = resolveEditorCommand(config.commands);
  return commandExists(command);
}

/**
 * Determines if a specific editor type is allowed to run in a sandbox environment.
 * @param editor The editor type to check.
 * @returns True if the editor is allowed in the sandbox, false otherwise.
 */
export function allowEditorTypeInSandbox(editor: EditorType): boolean {
  const config = editorConfigs.get(editor);
  if (!config) {
    return false;
  }
  const notUsingSandbox = !process.env.SANDBOX;
  return config.sandboxCompatible || notUsingSandbox;
}

/**
 * Check if the editor is valid and can be used.
 * Returns false if preferred editor is not set / invalid / not available / not allowed in sandbox.
 * @param editor The editor string to validate.
 * @returns True if the editor is available, false otherwise.
 */
export function isEditorAvailable(editor: string | undefined): boolean {
  if (!editor) {
    // Check if EDITOR environment variable is set and try to use it
    const defaultEditor = process.env.EDITOR as EditorType;
    if (defaultEditor && isValidEditorType(defaultEditor)) {
      if (process.env.DEBUG) {
        console.log(
          `DEBUG: No editor specified, falling back to EDITOR env var: ${defaultEditor}`,
        );
      }
      return (
        checkHasEditorType(defaultEditor) &&
        allowEditorTypeInSandbox(defaultEditor)
      );
    }
    if (process.env.DEBUG) {
      console.log(
        'DEBUG: No editor specified and EDITOR env var is not valid/available.',
      );
    }
    return false;
  }

  if (isValidEditorType(editor)) {
    return checkHasEditorType(editor) && allowEditorTypeInSandbox(editor);
  }
  if (process.env.DEBUG) {
    console.log(`DEBUG: Editor '${editor}' is not a valid editor type.`);
  }
  return false;
}

/**
 * Get the diff command for a specific editor.
 * @param oldPath The path to the old file.
 * @param newPath The path to the new file.
 * @param editor The editor type to use.
 * @param waitForClose If true, the parent process will wait for the editor to close. Defaults to true.
 * @returns A DiffCommand object or null if the editor is not supported.
 */
export function getDiffCommand(
  oldPath: string,
  newPath: string,
  editor: EditorType,
  waitForClose: boolean = true,
): DiffCommand | null {
  const config = editorConfigs.get(editor);
  if (!config) {
    if (process.env.DEBUG) {
      console.error(`DEBUG: No configuration found for editor type: ${editor}`);
    }
    return null;
  }

  const command = resolveEditorCommand(config.commands);
  const args = config.getDiffArgs(
    resolve(oldPath),
    resolve(newPath),
    waitForClose,
  ); // Resolve paths

  return { command, args, isGUI: config.isGUI };
}

/**
 * Opens a diff tool to compare two files.
 * Terminal-based editors by default blocks parent process until the editor exits.
 * GUI-based editors require args such as "--wait" to block parent process.
 * @param oldFilePath The path to the old file.
 * @param newFilePath The path to the new file.
 * @param editor The editor type to use.
 * @param waitForClose If true, the parent process will wait for the editor to close. Defaults to true.
 * @returns A promise that resolves when the editor closes or the process is spawned for non-waiting editors.
 */
export async function openDiff(
  oldFilePath: string,
  newFilePath: string,
  editor: EditorType,
  waitForClose: boolean = true,
): Promise<void> {
  const diffCommand = getDiffCommand(
    oldFilePath,
    newFilePath,
    editor,
    waitForClose,
  );

  if (!diffCommand) {
    throw new Error(
      `Failed to get diff command for editor: ${editor}. Please ensure it's installed and configured.`,
    );
  }

  if (process.env.DEBUG) {
    console.log(
      `DEBUG: Opening diff with command: ${diffCommand.command} ${diffCommand.args.join(' ')}`,
    );
  }

  try {
    const spawnOptions: SpawnOptions = {
      stdio: 'inherit',
      cwd: process.cwd(), // Set current working directory for spawn
      shell: true, // Use shell to correctly handle commands and arguments across platforms
    };

    if (diffCommand.isGUI && waitForClose) {
      return new Promise((resolve, reject) => {
        const childProcess = spawn(
          diffCommand.command,
          diffCommand.args,
          spawnOptions,
        );

        childProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(
              new Error(
                `Editor '${editor}' exited with code ${code}. Check the file paths and editor installation.`,
              ),
            );
          }
        });

        childProcess.on('error', (error: Error) => {
          reject(
            new Error(
              `Failed to open editor '${editor}': ${error.message}. Ensure the editor is installed and in your PATH.`,
            ),
          );
        });
      });
    } else {
      // For terminal editors or GUI editors when not waiting
      const commandString = `${diffCommand.command} ${diffCommand.args
        .map((arg) =>
          // Quote arguments that contain spaces for shell execution, especially important on Linux/macOS
          process.platform === 'win32' ? arg : `"${arg.replace(/"/g, '\"')}"`,
        )
        .join(' ')}`;

      execSync(commandString, spawnOptions);
      return Promise.resolve(); // For non-waiting or terminal-blocking commands, resolve immediately after execSync
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error opening diff with ${editor}: ${error.message}`);
      throw error; // Re-throw to allow caller to handle
    } else {
      console.error(
        `An unknown error occurred while opening diff with ${editor}.`,
      );
      throw new Error(`Unknown error opening diff with ${editor}.`);
    }
  }
}
