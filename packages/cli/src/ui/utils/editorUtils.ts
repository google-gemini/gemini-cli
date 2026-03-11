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
  resolveEditorTypeFromCommand,
} from '@google/gemini-cli-core';

const HEURISTIC_GUI_COMMANDS = [
  'code',
  'cursor',
  'subl',
  'zed',
  'atom',
] as const;

/**
 * Opens a file in an external editor and waits for it to close.
 * Handles raw mode switching to ensure the editor can interact with the terminal.
 *
 * @param filePath Path to the file to open
 * @param stdin The stdin stream from Ink/Node
 * @param setRawMode Function to toggle raw mode
 * @param preferredEditorType The user's preferred editor from config
 * @param openInNewWindow Whether to open VS Code-family editors in a new window
 */
export async function openFileInEditor(
  filePath: string,
  stdin: ReadStream | null | undefined,
  setRawMode: ((mode: boolean) => void) | undefined,
  preferredEditorType?: EditorType,
  openInNewWindow?: boolean,
): Promise<void> {
  let command: string | undefined = undefined;
  const args = [filePath];
  // Extra args that come before the file path (e.g. -nw for emacsclient)
  const extraArgs: string[] = [];

  if (preferredEditorType) {
    if (!isValidEditorType(preferredEditorType)) {
      coreEvents.emitFeedback(
        'error',
        `Editor '${preferredEditorType}' is not a recognized editor identifier. ` +
          `Supported editors: ${ALL_EDITORS.join(', ')}. ` +
          `Use /editor to select one, or set the $VISUAL or $EDITOR environment variable.`,
      );
      return;
    }
    command = getEditorCommand(preferredEditorType);
    if (isGuiEditor(preferredEditorType)) {
      args.unshift(getEditorWaitFlag(preferredEditorType));
    }
    extraArgs.push(
      ...getEditorExtraArgs(preferredEditorType, {
        newWindow: openInNewWindow,
      }),
    );
  }

  if (!command) {
    const envCommand = process.env['VISUAL'] ?? process.env['EDITOR'];
    if (envCommand) {
      command = envCommand;
      const [envExecutable = ''] = envCommand.split(' ');
      const resolvedType = resolveEditorTypeFromCommand(envExecutable);
      if (resolvedType) {
        if (
          isGuiEditor(resolvedType) &&
          !envCommand.includes('--wait') &&
          !envCommand.includes('-w')
        ) {
          args.unshift(getEditorWaitFlag(resolvedType));
        }
        extraArgs.push(
          ...getEditorExtraArgs(resolvedType, { newWindow: openInNewWindow }),
        );
      } else {
        // Heuristic fallback for commands not in the registry
        const lower = envCommand.toLowerCase();
        const isGui = HEURISTIC_GUI_COMMANDS.some((g) => lower.includes(g));
        if (isGui && !lower.includes('--wait') && !lower.includes('-w')) {
          args.unshift(lower.includes('subl') ? '-w' : '--wait');
        }
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
        coreEvents.emitFeedback(
          'error',
          spawnErr.code === 'ENOENT'
            ? `Editor command '${executable}' was not found in PATH. Install it or use /editor to choose another editor.`
            : (spawnErr.message ?? String(spawnErr)),
        );
        return;
      }
      if (typeof result.status === 'number' && result.status !== 0) {
        coreEvents.emitFeedback(
          'error',
          `External editor exited with status ${result.status}`,
        );
        return;
      }
    } else {
      await new Promise<void>((resolve) => {
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
          resolve();
          coreEvents.emitFeedback(
            'error',
            spawnErr.code === 'ENOENT'
              ? `Editor command '${executable}' was not found in PATH. Install it or use /editor to choose another editor.`
              : (spawnErr.message ?? String(spawnErr)),
          );
        });

        child.on('close', (status) => {
          resolve();
          if (typeof status === 'number' && status !== 0) {
            coreEvents.emitFeedback(
              'error',
              `External editor exited with status ${status}`,
            );
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
