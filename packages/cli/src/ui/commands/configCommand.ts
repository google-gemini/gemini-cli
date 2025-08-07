/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind, CommandContext } from './types.js';

/**
 * /config command to display the current generation configuration
 */
export const configCommand: SlashCommand = {
  name: 'config',
  description:
    'Show current generation configuration (temperature, topK, thinking_budget)',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
    const { services } = context;
    const config = services.config;

    if (!config) {
      return {
        type: 'message' as const,
        messageType: 'error' as const,
        content: 'Configuration not loaded',
      };
    }

    const generationConfig = config.getGenerationConfig();
    const model = config.getModel();

    let configText = `Current Configuration\n`;
    configText += `${'─'.repeat(50)}\n\n`;
    configText += `Model: ${model}\n\n`;
    configText += `Generation Parameters:\n`;

    if (generationConfig) {
      configText += `  • Temperature: ${generationConfig.temperature ?? 'default (0)'}\n`;
      configText += `  • Top-K: ${generationConfig.topK ?? 'not set'}\n`;
      configText += `  • Thinking Budget: ${generationConfig.thinking_budget ?? 'not set'}\n`;
    } else {
      configText += `  Using default generation parameters:\n`;
      configText += `  • Temperature: 0\n`;
      configText += `  • Top-K: not set\n`;
      configText += `  • Thinking Budget: not set\n`;
    }

    configText += `\nConfiguration Sources (in order of precedence):\n`;
    configText += `  1. CLI flags (--temperature, --top-k, --thinking-budget)\n`;
    configText += `  2. Environment variables (GEMINI_TEMPERATURE, GEMINI_TOP_K, GEMINI_THINKING_BUDGET)\n`;
    configText += `  3. Settings files (.gemini/settings.json)`;

    return {
      type: 'message' as const,
      messageType: 'info' as const,
      content: configText,
    };
  },
};
