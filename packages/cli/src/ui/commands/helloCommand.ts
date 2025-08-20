/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType, type HistoryItemInfo } from '../types.js';

export const helloCommand: SlashCommand = {
  name: 'hello',
  description: 'Prints a friendly greeting.',
  kind: CommandKind.BUILT_IN,
  action: (context, _args) => {
    const infoItem: Omit<HistoryItemInfo, 'id'> = {
      type: MessageType.INFO,
      text: 'Hello, world!',
    };
    context.ui.addItem(infoItem, Date.now());
  },
};
