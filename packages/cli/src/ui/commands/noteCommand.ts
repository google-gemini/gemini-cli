/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { isNodeError } from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';

export const noteCommand: SlashCommand = {
  name: 'note',
  description: 'Append a note to notes.md or view current notes',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context, args) => {
    const notesPath = path.join(process.cwd(), 'notes.md');

    if (!args || args.trim().length === 0) {
      try {
        const content = await fs.readFile(notesPath, 'utf8');
        return {
          type: 'message',
          messageType: 'info',
          content: `Current notes in ${notesPath}:\n\n${content}`,
        };
      } catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT') {
          return {
            type: 'message',
            messageType: 'info',
            content: 'No notes found. Use "/note <text>" to add one.',
          };
        }
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to read notes: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    try {
      const trimmedNote = args.trim();
      await fs.appendFile(notesPath, `${trimmedNote}\n`);
      return {
        type: 'message',
        messageType: 'info',
        content: `Note added to ${notesPath}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to save note: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
