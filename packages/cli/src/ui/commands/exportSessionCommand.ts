/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import { MessageType, type HistoryItemExportSession } from '../types.js';
import { SessionSelector } from '../../utils/sessionUtils.js';

export const exportSessionCommand: SlashCommand = {
  name: 'export-session',
  description: 'Export the current session to a JSON file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn | void> => {
    const { ui } = context;
    const args = context.invocation?.args.trim();
    if (!args) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Please provide a file path to export the session to. Example: /export-session ./my-session.json',
      };
    }

    const sessionId = context.services.agentContext?.config.getSessionId();
    if (!sessionId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No active session found to export.',
      };
    }

    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Operation already in progress, please wait.',
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemExportSession = {
      type: MessageType.EXPORT_SESSION,
      exportSession: {
        isPending: true,
      },
    };

    try {
      ui.setPendingItem(pendingMessage);
      const storage = context.services.agentContext!.config.storage;
      const sessionSelector = new SessionSelector(storage);
      const { sessionData } = await sessionSelector.resolveSession(sessionId);

      const targetPath = path.resolve(process.cwd(), args);

      await fs.writeFile(
        targetPath,
        JSON.stringify(sessionData, null, 2),
        'utf-8',
      );

      ui.addItem(
        {
          type: MessageType.EXPORT_SESSION,
          exportSession: {
            isPending: false,
            targetPath,
          },
        } as HistoryItemExportSession,
        Date.now(),
      );
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    } finally {
      ui.setPendingItem(null);
    }
  },
};
