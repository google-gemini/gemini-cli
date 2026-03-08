/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

/**
 * Slash command to toggle terminal output verbosity for the current session.
 * This setting is not persisted to disk, fulfilling the session-only requirement.
 */
export const verbosityCommand: SlashCommand = {
  name: 'verbosity',
  description:
    'Set UI verbosity level for the current session (quiet | standard | verbose)',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const levelString = typeof args === 'string' ? args : args[0];
    const level = levelString?.toLowerCase();

    if (!level || !['quiet', 'standard', 'verbose', 'debug'].includes(level)) {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content: 'Usage: /verbosity <quiet|standard|verbose|debug>',
      };
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content: 'Config service not available.',
      };
    }

    // Direct mutation of the config instance for session-only effect.
    // This bypasses the LoadedSettings.setValue() persistence layer.
    try {
      // Accessing private ui via any for session-only mutation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion
      const anyConfig = config as any;
      if (anyConfig.ui) {
        anyConfig.ui.verbosityLevel = level;
      }

      return {
        type: 'message',
        messageType: MessageType.INFO,
        content: `UI Verbosity level set to **${level}** for this session.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: MessageType.ERROR,
        content: `Failed to set verbosity: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
