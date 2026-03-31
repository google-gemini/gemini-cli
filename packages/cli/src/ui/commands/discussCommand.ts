/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageActionReturn } from '@google/gemini-cli-core';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import {
  isDiscussionActive,
  startDiscussion,
  stopDiscussion,
  summarizeDiscussion,
  handleDiscussionUserMessage,
} from '../discuss/discussionRuntime.js';

export const discussCommand: SlashCommand = {
  name: 'discuss',
  description:
    'Run a moderated multi-agent discussion (builder/skeptic/explorer + moderator). Usage: /discuss start <topic>',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context, args): Promise<void | MessageActionReturn> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Discuss mode is unavailable: config is missing.',
      };
    }

    const trimmed = args.trim();
    const [subcommand] = trimmed.split(/\s+/, 1);

    if (subcommand === 'start') {
      const topic = args.replace(/^start\s*/i, '').trim();
      if (!topic) {
        return {
          type: 'message',
          messageType: 'error',
          content:
            'Missing topic. Usage: /discuss start <topic>. Multi-line text is supported.',
        };
      }
      await startDiscussion(config, topic, context.ui.addItem);
      return;
    }

    if (subcommand === 'stop' || subcommand === 'end') {
      await stopDiscussion(config, context.ui.addItem);
      return;
    }

    if (subcommand === 'status') {
      const active = await isDiscussionActive(config);
      return {
        type: 'message',
        messageType: 'info',
        content: active
          ? 'Discuss session is active. Chime in with normal messages anytime.'
          : 'No active discuss session.',
      };
    }

    if (subcommand === 'summary' || subcommand === 'summarize') {
      await summarizeDiscussion(config, context.ui.addItem);
      return;
    }

    // `/discuss <message>` chimes in directly if active.
    if (trimmed) {
      const handled = await handleDiscussionUserMessage(
        config,
        args,
        context.ui.addItem,
        context.ui.setPendingItem,
      );
      if (!handled) {
        return {
          type: 'message',
          messageType: 'info',
          content:
            'No active discuss session. Start one with /discuss start <topic>.',
        };
      }
      return;
    }

    return {
      type: 'message',
      messageType: 'info',
      content:
        'Usage: /discuss start <topic> | /discuss status | /discuss summary | /discuss stop',
    };
  },
  completion: (_context, partialArg) => {
    const options = ['start', 'status', 'summary', 'stop'];
    const lower = partialArg.toLowerCase();
    return options.filter((opt) => opt.startsWith(lower));
  },
};
