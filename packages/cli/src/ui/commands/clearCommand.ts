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
    context.ui.setDebugMessage('Clearing terminal and resetting chat.');
    await context.services.config?.getGeminiClient()?.resetChat();
    context.ui.clear();
  },
};
