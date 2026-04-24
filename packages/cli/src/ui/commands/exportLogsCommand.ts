/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { getConsoleMessages } from '../hooks/useConsoleMessages.js';

export const exportLogsCommand: SlashCommand = {
  name: 'export-logs',
  description: 'Export debug console logs to a JSON file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (_context, args): Promise<MessageActionReturn> => {
    const messages = getConsoleMessages();

    if (messages.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No console logs to export.',
      };
    }

    const filename = args.trim() || `gemini-logs-${Date.now()}.json`;
    const filePath = path.resolve(filename);

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.json') {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Only .json format is supported for log export.',
      };
    }

    try {
      await fsPromises.writeFile(
        filePath,
        JSON.stringify(messages, null, 2),
        'utf-8',
      );
      return {
        type: 'message',
        messageType: 'info',
        content: `Exported ${messages.length} log entries to ${filename}`,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        type: 'message',
        messageType: 'error',
        content: `Error exporting logs: ${errorMessage}`,
      };
    }
  },
};
