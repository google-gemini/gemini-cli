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
import { MessageType } from '../types.js';
import { SessionSelector } from '../../utils/sessionUtils.js';
import { Storage } from '@google/gemini-cli-core';

export const exportSessionCommand: SlashCommand = {
  name: 'export-session',
  description: 'Export the current session to a JSON file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn | void> => {
    const args = context.invocation?.args.trim();
    if (!args) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Please provide a file path to export the session to. Example: /export-session ./my-session.json',
      };
    }

    const sessionId = context.services.agentContext?.config.sessionId;
    if (!sessionId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No active session found to export.',
      };
    }

    try {
      const storage = context.services.agentContext!.config.storage;
      const sessionSelector = new SessionSelector(storage);
      const { sessionData } = await sessionSelector.resolveSession(sessionId);

      const targetPath = path.resolve(process.cwd(), args);
      
      // Ensure we don't accidentally overwrite without some check, or just write it.
      // The design says to write directly, but we can do a simple access check.
      try {
        await fs.access(targetPath);
        // If it exists, let's just proceed as users can overwrite, or we can prompt.
        // For simplicity and matching typical CLI tools, we just write.
      } catch {
        // File doesn't exist, which is fine
      }

      await fs.writeFile(targetPath, JSON.stringify(sessionData, null, 2), 'utf-8');

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Successfully exported session to ${targetPath}`,
        },
        Date.now(),
      );
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
