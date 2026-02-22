/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { copyToClipboard } from '../utils/commandUtils.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const copyCommand: SlashCommand = {
  name: 'copy',
  description: 'Copy the last result or code snippet to clipboard',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const lastOutput = context.ui.getLastOutput();
    const textToCopy = lastOutput?.content;

    if (!textToCopy) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No output in history',
      };
    }

    try {
      const settings = context.services.settings.merged;
      await copyToClipboard(textToCopy, settings);

      return {
        type: 'message',
        messageType: 'info',
        content: 'Last output copied to the clipboard',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.debug(message);

      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to copy to the clipboard. ${message}`,
      };
    }
  },
};
