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
 * Action for the `/auto` slash command.
 *
 * Switches the current interactive session into "auto mode", where tool calls
 * that would normally block for user confirmation are automatically denied.
 * This forces the agent to try alternative, policy-approved approaches.
 *
 * If the agent encounters too many consecutive denials, it automatically
 * falls back to interactive mode.
 */
async function autoAction(context: CommandContext): Promise<void> {
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

  if (!config.isInteractive()) {
    context.ui.addItem(
      {
        type: MessageType.WARNING,
        text: 'Already running in non-interactive mode.',
      },
      Date.now(),
    );
    return;
  }

  if (config.isAutoMode()) {
    context.ui.addItem(
      {
        type: MessageType.WARNING,
        text: 'Already in auto mode. Use /interactive to return to interactive mode.',
      },
      Date.now(),
    );
    return;
  }

  config.enterAutoMode();

  context.ui.addItem(
    {
      type: MessageType.INFO,
      text: [
        '🤖 **Auto mode enabled.**',
        '',
        'The agent will now continue autonomously:',
        '  • Commands requiring confirmation will be **auto-denied**',
        '  • The agent will try alternative, safe approaches',
        '  • If the agent gets stuck (5+ consecutive denials), it will **fall back to interactive mode**',
        '',
        'Use `/interactive` to manually return to interactive mode.',
      ].join('\n'),
    },
    Date.now(),
  );
}

export const autoCommand: SlashCommand = {
  name: 'auto',
  altNames: ['headless', 'autonomous'],
  description:
    'Switch to auto mode — auto-deny confirmations for autonomous execution',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: autoAction,
};
