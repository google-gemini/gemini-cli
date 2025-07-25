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

export const apikeyCommand: SlashCommand = {
  name: 'apikey',
  description: 'Set the API key for the selected provider',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string[]): Promise<Message> => {
    const {
      services: { settings },
    } = context;
    const apiKey = args[0];

    if (!apiKey) {
      return Promise.resolve({
        type: MessageType.ERROR,
        content: 'Please provide an API key.',
        timestamp: new Date(),
      });
    }

    settings.setValue(SettingScope.User, 'openRouter', {
      ...settings.merged.openRouter,
      apiKey,
    });

    return Promise.resolve({
      type: MessageType.INFO,
      content: 'API key set successfully.',
      timestamp: new Date(),
    });
  },
};
