/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemContext } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { getContextBreakdown } from '../../services/contextInfoService.js';

export const contextCommand: SlashCommand = {
  name: 'context',
  altNames: ['tokens'],
  description: 'Display context window and token usage information',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
    const geminiClient = context.services.config?.getGeminiClient();
    const breakdown = await getContextBreakdown(
      context.services.config,
      geminiClient,
    );

    const contextItem: HistoryItemContext = {
      type: 'context',
      breakdown,
    };

    context.ui.addItem(contextItem, Date.now());
  },
};
