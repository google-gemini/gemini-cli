/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandContext,
  CommandKind,
  Message,
  MessageType,
  SlashCommand,
} from './types.js';
import { SettingScope } from '../../config/settings.js';

export const endpointCommand: SlashCommand = {
  name: 'endpoint',
  description: 'Set the endpoint for the selected provider',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string[]): Promise<Message> => {
    const {
      services: { settings },
    } = context;
    const endpoint = args[0];

    if (!endpoint) {
      return Promise.resolve({
        type: MessageType.ERROR,
        content: 'Please provide an endpoint.',
        timestamp: new Date(),
      });
    }

    settings.setValue(SettingScope.User, 'mcpServers', {
      ...settings.merged.mcpServers,
      openrouter: {
        ...settings.merged.mcpServers?.['openrouter'],
        url: endpoint,
        httpUrl: endpoint,
      },
    });

    return Promise.resolve({
      type: MessageType.INFO,
      content: `Endpoint set to ${endpoint}`,
      timestamp: new Date(),
    });
  },
};
