/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ReadStream } from 'node:tty';
import {
  ALL_EDITORS,
  CoreEvent,
  coreEvents,
  type EditorType,
  getEditorCommand,
  getEditorExtraArgs,
  getEditorWaitFlag,
  isGuiEditor,
  isTerminalEditor,
  isValidEditorType,
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
  // Extra args that come before the file path (e.g. -nw for emacsclient)
  const extraArgs: string[] = [];

  if (preferredEditorType) {
    if (!isValidEditorType(preferredEditorType)) {
      throw new Error(
        `Editor '${preferredEditorType}' is not a recognized editor identifier. ` +
          `Supported editors: ${ALL_EDITORS.join(', ')}. ` +
          `Use /editor to select one, or set the $VISUAL or $EDITOR environment variable.`,
      );
    }
    command = getEditorCommand(preferredEditorType);
    if (isGuiEditor(preferredEditorType)) {
      args.unshift(getEditorWaitFlag(preferredEditorType));
    }
    extraArgs.push(...getEditorExtraArgs(preferredEditorType));
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
  const terminalEditors = [
    'vi',
    'vim',
    'nvim',
    'emacs',
    'emacsclient',
    'hx',
    'nano',
    'micro',
  ];
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
      const result = spawnSync(
        executable,
        [...initialArgs, ...extraArgs, ...args],
        {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        },
      );
      if (result.error) {
        const spawnErr = result.error as NodeJS.ErrnoException;
        throw spawnErr.code === 'ENOENT'
          ? new Error(
              `Editor command '${executable}' was not found in PATH. Install it or use /editor to choose another editor.`,
            )
          : result.error;
      }
      if (typeof result.status === 'number' && result.status !== 0) {
        throw new Error(`External editor exited with status ${result.status}`);
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          executable,
          [...initialArgs, ...extraArgs, ...args],
          {
            stdio: 'inherit',
            shell: process.platform === 'win32',
          },
        );

        child.on('error', (err) => {
          const spawnErr = err as NodeJS.ErrnoException;
          reject(
            spawnErr.code === 'ENOENT'
              ? new Error(
                  `Editor command '${executable}' was not found in PATH. Install it or use /editor to choose another editor.`,
                )
              : err,
          );
        });

        child.on('close', (status) => {
          if (typeof status === 'number' && status !== 0) {
            reject(new Error(`External editor exited with status ${status}`));
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
