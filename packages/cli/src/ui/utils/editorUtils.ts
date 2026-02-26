/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ReadStream } from 'node:tty';
import {
  coreEvents,
  CoreEvent,
  type EditorType,
  getEditorCommand,
  isGuiEditor,
  isTerminalEditor,
} from '@google/gemini-cli-core';

/**
 * Opens a file in an external editor and waits for it to close.
 * Handles raw mode switching to ensure the editor can interact with the terminal.
 *
 * @param filePath Path to the file to open
 * @param stdin The stdin stream from Ink/Node
 * @param setRawMode Function to toggle raw mode
 * @param preferredEditorType The user's preferred editor from config
 */
export async function openFileInEditor(
  filePath: string,
  stdin: ReadStream | null | undefined,
  setRawMode: ((mode: boolean) => void) | undefined,
  preferredEditorType?: EditorType,
): Promise<void> {
  let command: string | undefined = undefined;
  const args = [filePath];

  if (preferredEditorType) {
    command = getEditorCommand(preferredEditorType);
    if (isGuiEditor(preferredEditorType)) {
      args.unshift('--wait');
    }
  }

  if (!command) {
    command = process.env['VISUAL'] ?? process.env['EDITOR'];
    if (command) {
      const lowerCommand = command.toLowerCase();
      const isGui = ['code', 'cursor', 'subl', 'zed', 'atom'].some((gui) =>
        lowerCommand.includes(gui),
      );
      if (
        isGui &&
        !lowerCommand.includes('--wait') &&
        !lowerCommand.includes('-w')
      ) {
        args.unshift(lowerCommand.includes('subl') ? '-w' : '--wait');
      }
    }
  }

  if (!command) {
    command = process.platform === 'win32' ? 'notepad' : 'vi';
  }

  const [executable = '', ...initialArgs] = command.split(' ');

  // Determine if we should use sync or async based on the command/editor type.
  // If we have a preferredEditorType, we can check if it's a terminal editor.
  // Otherwise, we guess based on the command name.
  const terminalEditors = ['vi', 'vim', 'nvim', 'emacs', 'hx', 'nano'];
  const isTerminal = preferredEditorType
    ? isTerminalEditor(preferredEditorType)
    : terminalEditors.some((te) => executable.toLowerCase().includes(te));

  if (
    isTerminal &&
    (executable.includes('vi') ||
      executable.includes('vim') ||
      executable.includes('nvim'))
  ) {
    // Pass -i NONE to prevent E138 'Can't write viminfo file' errors in restricted environments.
    args.unshift('-i', 'NONE');
  }

  const wasRaw = stdin?.isRaw ?? false;
  setRawMode?.(false);

  try {
    if (isTerminal) {
      const result = spawnSync(executable, [...initialArgs, ...args], {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      if (result.error) {
        coreEvents.emitFeedback(
          'error',
          '[editorUtils] external terminal editor error',
          result.error,
        );
        throw result.error;
      }
      if (typeof result.status === 'number' && result.status !== 0) {
        const err = new Error(
          `External editor exited with status ${result.status}`,
        );
        coreEvents.emitFeedback(
          'error',
          '[editorUtils] external editor error',
          err,
        );
        throw err;
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, [...initialArgs, ...args], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });

        child.on('error', (err) => {
          coreEvents.emitFeedback(
            'error',
            '[editorUtils] external editor spawn error',
            err,
          );
          reject(err);
        });

        child.on('close', (status) => {
          if (typeof status === 'number' && status !== 0) {
            const err = new Error(
              `External editor exited with status ${status}`,
            );
            coreEvents.emitFeedback(
              'error',
              '[editorUtils] external editor error',
              err,
            );
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  } finally {
    if (wasRaw) {
      setRawMode?.(true);
    }
    coreEvents.emit(CoreEvent.ExternalEditorClosed);
  }
}
