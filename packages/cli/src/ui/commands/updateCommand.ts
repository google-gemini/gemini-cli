/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
} from './types.js';
import { performUpdate } from '../../utils/performUpdate.js';
import { MessageType } from '../types.js';
import process from 'node:process';

export const updateCommand: SlashCommand = {
  name: 'update',
  description: 'Check for and install a newer version of Gemini CLI',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const projectRoot =
      context.services.agentContext?.config.getTargetDir() ?? process.cwd();

    context.ui.addItem(
      { type: MessageType.INFO, text: 'Checking for updates...' },
      Date.now(),
    );

    const result = await performUpdate(projectRoot);

    switch (result.status) {
      case 'up-to-date':
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Gemini CLI is up to date. (${result.current})`,
          },
          Date.now(),
        );
        break;

      case 'updated':
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Successfully updated from ${result.from} to ${result.to}. Restart to use the new version.`,
          },
          Date.now(),
        );
        break;

      case 'unsupported':
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: result.message,
          },
          Date.now(),
        );
        break;

      case 'error':
        return {
          type: 'message' as const,
          messageType: 'error' as const,
          content: result.message,
        };
      default: {
        // Exhaustive check
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  },
};
