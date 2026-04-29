/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import {
  chatResumeSubCommands,
  resumeCheckpointCommand,
} from './chatCommand.js';
import { parseSlashCommand } from '../../utils/commands.js';

export const resumeCommand: SlashCommand = {
  name: 'resume',
  description: 'Browse auto-saved conversations and manage chat checkpoints',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    if (args) {
      const parsed = parseSlashCommand(`/${args}`, chatResumeSubCommands);
      if (parsed.commandToExecute?.action) {
        return parsed.commandToExecute.action(context, parsed.args);
      }

      // Fallback: If no subcommand matched but args were provided,
      // assume it's a legacy resume command and try to resume the checkpoint
      if (resumeCheckpointCommand.action) {
        return resumeCheckpointCommand.action(context, args);
      }
    }

    return {
      type: 'dialog',
      dialog: 'sessionBrowser',
    };
  },
  subCommands: chatResumeSubCommands,
};
