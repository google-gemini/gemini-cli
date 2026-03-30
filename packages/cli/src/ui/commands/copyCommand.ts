/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import { copyToClipboard } from '../utils/commandUtils.js';
 Fix/copy-to-Capture-Slash-Command-Output
import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  LastOutput,
} from './types.js';
import { CommandKind } from './types.js';

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';
 main

export const copyCommand: SlashCommand = {
  name: 'copy',
  description: 'Copy the last result or code snippet to clipboard',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
 Fix/copy-to-Capture-Slash-Command-Output
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const lastOutput: LastOutput | undefined = context.ui.getLastOutput();
    const textToCopy = lastOutput?.content;

  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const chat = context.services.agentContext?.geminiClient?.getChat();
    const history = chat?.getHistory();
 main

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
