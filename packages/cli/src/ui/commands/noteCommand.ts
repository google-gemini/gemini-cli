/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';

export const noteCommand: SlashCommand = {
  name: 'note',
  description: 'Manage workspace notes (append or view)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  subCommands: [
    {
      name: 'view',
      description: 'View the current workspace notes',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      takesArgs: false,
      action: async () => {
        const workspaceRoot = process.cwd();
        const notesFile = path.join(workspaceRoot, 'notes.md');

        try {
          const content = await fsPromises.readFile(notesFile, 'utf8');
          return {
            type: 'message',
            messageType: 'info',
            content: `### Current Notes\n\n${content}`,
          };
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            err.code === 'ENOENT'
          ) {
            return {
              type: 'message',
              messageType: 'info',
              content: 'No notes found in this workspace.',
            };
          }
          const errorMessage = err instanceof Error ? err.message : String(err);
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to read notes: ${errorMessage}`,
          };
        }
      },
    },
  ],
  action: async (context, args) => {
    if (!args.trim()) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'Please provide a note to save or use `/note view` to see your notes. Example: `/note This is a useful thought.`',
      };
    }

    const workspaceRoot = process.cwd();
    const notesFile = path.join(workspaceRoot, 'notes.md');
    const timestamp = new Date().toLocaleString();

    const noteEntry = `\n## ${timestamp}\n\n${args.trim()}\n`;

    try {
      await fsPromises.appendFile(notesFile, noteEntry);

      return {
        type: 'message',
        messageType: 'info',
        content: `Note saved to ${notesFile}`,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save note: ${errorMessage}`,
      };
    }
  },
};
