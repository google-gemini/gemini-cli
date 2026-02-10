/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { InsightsService } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

/**
 * Slash command to generate usage insights based on past sessions.
 */
export const insightsCommand: SlashCommand = {
  name: 'insights',
  description: 'Analyze past sessions and get usage improvements and summary.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const config = context.services.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Config is not available.',
      });
      return;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Analyzing your past sessions to generate insights...',
    });

    try {
      const insightsService = new InsightsService(config);
      const baseLlmClient = config.getBaseLlmClient();

      const reportMarkdown =
        await insightsService.generateInsightsReport(baseLlmClient);

      context.ui.addItem({
        type: MessageType.GEMINI,
        text: reportMarkdown,
      });
    } catch (error) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to generate insights: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
};
