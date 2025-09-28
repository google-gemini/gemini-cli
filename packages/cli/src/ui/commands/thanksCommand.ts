/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';

export const thanksCommand: SlashCommand = {
  name: 'thanks',
  description: 'Provide positive feedback on the previous response',
  kind: CommandKind.BUILT_IN,
  isFeedback: true,
  altNames: ['good', 'ack'],
  action: async (context: CommandContext): Promise<void> => {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Feedback received. Thank you!',
      },
      Date.now(),
    );
  },
};
