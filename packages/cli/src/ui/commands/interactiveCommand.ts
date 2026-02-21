/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType } from '../types.js';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
} from './types.js';

/**
 * Action for the `/interactive` slash command.
 *
 * Returns the session from auto mode back to normal interactive mode,
 * where tool calls requiring confirmation will block and wait for user input.
 */
async function interactiveAction(context: CommandContext): Promise<void> {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem(
      {
        type: MessageType.ERROR,
        text: 'Configuration not available.',
      },
      Date.now(),
    );
    return;
  }

  if (!config.isAutoMode()) {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Already in interactive mode.',
      },
      Date.now(),
    );
    return;
  }

  config.exitAutoMode();

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: [
        '👤 **Interactive mode restored.**',
        '',
        'Commands requiring confirmation will now wait for your approval.',
      ].join('\n'),
    },
    Date.now(),
  );
}

export const interactiveCommand: SlashCommand = {
  name: 'interactive',
  description: 'Return to interactive mode from auto mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: interactiveAction,
};
