/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { parseLoopCommandArgs } from '../utils/loopCommand.js';

export const loopCommand: SlashCommand = {
  name: 'loop',
  kind: CommandKind.BUILT_IN,
  description: 'Queue a recurring message every Xm: /loop 3m continue',
  isSafeConcurrent: true,
  action: async (context, args) => {
    let schedule;
    try {
      schedule = parseLoopCommandArgs(args);
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: error instanceof Error ? error.message : String(error),
      };
    }

    if (!context.ui.scheduleLoop?.(schedule)) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'The /loop command is only available in interactive sessions.',
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Scheduled /loop every ${schedule.intervalSpec}: ${schedule.prompt}`,
    };
  },
};
