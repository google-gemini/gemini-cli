/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';
import { MessageType } from '../types.js';

/**
 * /config command to display the current generation configuration
 */
export const configCommand: SlashCommand = {
  name: 'config',
  description: 'Show current generation configuration (temperature, topK, thinking_budget)',
  aliases: ['settings', 'params'],
  execute: async (context) => {
    const { config, addMessage } = context;
    
    if (!config) {
      addMessage({
        type: MessageType.ERROR,
        text: 'Configuration not loaded',
      });
      return { status: 'error' };
    }
    
    const generationConfig = config.getGenerationConfig();
    const model = config.getModel();
    
    let configText = `**Current Configuration**\n\n`;
    configText += `**Model:** ${model}\n\n`;
    configText += `**Generation Parameters:**\n`;
    
    if (generationConfig) {
      configText += `- Temperature: ${generationConfig.temperature ?? 'default (0)'}\n`;
      configText += `- Top-K: ${generationConfig.topK ?? 'not set'}\n`;
      configText += `- Thinking Budget: ${generationConfig.thinking_budget ?? 'not set'}\n`;
    } else {
      configText += `Using default generation parameters:\n`;
      configText += `- Temperature: 0\n`;
      configText += `- Top-K: not set\n`;
      configText += `- Thinking Budget: not set\n`;
    }
    
    configText += `\n**Configuration Sources** (in order of precedence):\n`;
    configText += `1. CLI flags (--temperature, --top-k, --thinking-budget)\n`;
    configText += `2. Environment variables (GEMINI_TEMPERATURE, GEMINI_TOP_K, GEMINI_THINKING_BUDGET)\n`;
    configText += `3. Settings files (.gemini/settings.json)\n`;
    
    addMessage({
      type: MessageType.INFO,
      text: configText,
    });
    
    return { status: 'success' };
  },
};