/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'clear the screen and conversation history',
  action: async (context, _args) => {
    context.utils.onDebugMessage('Clearing terminal and resetting chat.');
    context.ui.clearItems();
    await context.services.config?.getGeminiClient()?.resetChat();
    console.clear();
    context.ui.refreshStatic();
  },
};
