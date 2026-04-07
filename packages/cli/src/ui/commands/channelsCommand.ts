/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import {
  MessageType,
  type ChannelInfo,
  type HistoryItemChannelsList,
} from '../types.js';
import { activeChannels } from '@google/gemini-cli-core';

export const channelsCommand: SlashCommand = {
  name: 'channels',
  description: 'List active message channels from MCP servers',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const channels: ChannelInfo[] = Array.from(activeChannels.entries()).map(
      ([name, capability]) => ({
        name,
        displayName: capability.displayName,
        supportsReply: capability.supportsReply,
      }),
    );

    const channelsListItem: HistoryItemChannelsList = {
      type: MessageType.CHANNELS_LIST,
      channels,
    };

    context.ui.addItem(channelsListItem);

    return;
  },
};
