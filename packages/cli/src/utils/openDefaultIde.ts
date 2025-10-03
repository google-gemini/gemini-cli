/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import { getErrorMessage } from '@google/gemini-cli-core';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Common code editors to try, in order of preference
 */
const CODE_EDITORS = [
  // VS Code and its forks
  'code', // Visual Studio Code
  'code-insiders', // Visual Studio Code Insiders
  'codium', // VSCodium (open source fork of VS Code)
  'cursor', // Cursor (VS Code fork)
  'theia', // Theia (framework for VS Code alternatives)
];

/**
 * Checks if a command is available in the system PATH
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(platform() === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
    });

    child.on('exit', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Opens the default IDE/editor for the current working directory.
 * This will attempt to open the directory in a code editor, trying
 * common editors in order of preference before falling back to the
 * system's default application for directories.
 */
export async function openDefaultIde(directory = process.cwd()): Promise<void> {
  try {
    // First, try to find and open with a code editor
    for (const editor of CODE_EDITORS) {
      if (await isCommandAvailable(editor)) {
        try {
          const childProcess = spawn(editor, [directory], {
            detached: true,
            stdio: 'ignore',
          });

          // Unref so the parent process can exit
          childProcess.unref();

          return; // Successfully opened with a code editor
        } catch (error) {
          // Continue to next editor if this one fails
          console.debug(
            `Failed to open with ${editor}:`,
            getErrorMessage(error),
          );
        }
      }
    }

    // Fallback: open with system default application
    console.log(
      'No code editor found, opening with system default application...',
    );
    const childProcess = await open(directory);

    // Attach an error handler to prevent unhandled errors
    childProcess.on('error', (error) => {
      console.error(
        'Failed to open default application.',
        getErrorMessage(error),
      );
    });
  } catch (error) {
    console.error('Failed to open default IDE:', getErrorMessage(error));
    throw error;
  }
}
