/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command, CommandContext, CommandArgs } from './types.js';

export const clearCommand: Command = {
  name: 'clear',
  description: 'clear the screen and conversation history',
  action: async (context: CommandContext, _args: CommandArgs) => {
    context.utils.onDebugMessage('Clearing terminal and resetting chat.');
    context.ui.clearItems();
    await context.services.config?.getGeminiClient()?.resetChat();
    console.clear();
    context.ui.refreshStatic();
  },
};
