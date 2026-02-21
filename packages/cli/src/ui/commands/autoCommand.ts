/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';

const DEFAULT_PROMPT = 'continue';

export const autoCommand: SlashCommand = {
  name: 'auto',
  altNames: ['headless'],
  description:
    'Run the agent headlessly for one run (auto-rejecting confirmations)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const config = context.services.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    config.enterHeadlessMode();

    context.ui.addItem(
      {
        type: 'info',
        text: 'Headless mode enabled for this run; approvals will be auto-rejected.',
      },
      Date.now(),
    );

    const trimmedArgs = args.trim();
    return {
      type: 'submit_prompt',
      content: trimmedArgs.length > 0 ? trimmedArgs : DEFAULT_PROMPT,
    };
  },
};
