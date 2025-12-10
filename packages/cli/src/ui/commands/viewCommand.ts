/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  debugLogger,
  openInEditor,
  isEditorAvailable,
  type EditorType,
} from '@google/gemini-cli-core';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const viewCommand: SlashCommand = {
  name: 'view',
  description: 'Open the last result in external editor',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args): Promise<SlashCommandActionReturn | void> => {
    const preferredEditor = context.services.settings.merged.general
      ?.preferredEditor as EditorType | undefined;

    if (!preferredEditor || !isEditorAvailable(preferredEditor)) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'No editor configured. Use /editor to set your preferred editor.',
      };
    }

    const chat = await context.services.config?.getGeminiClient()?.getChat();
    const history = chat?.getHistory();

    // Get the last message from the AI (model role)
    const lastAiMessage = history
      ? history.filter((item) => item.role === 'model').pop()
      : undefined;

    if (!lastAiMessage) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No output in history',
      };
    }

    // Extract text from the parts
    const lastAiOutput = lastAiMessage.parts
      ?.filter((part) => part.text)
      .map((part) => part.text)
      .join('');

    if (!lastAiOutput) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Last AI output contains no text to view.',
      };
    }

    try {
      // Create a temporary file with the content
      const tempFile = join(tmpdir(), `gemini-output-${Date.now()}.md`);
      writeFileSync(tempFile, lastAiOutput, 'utf-8');

      // Open the file in the preferred editor
      await openInEditor(tempFile, preferredEditor);

      return {
        type: 'message',
        messageType: 'info',
        content: `Opened last output in ${preferredEditor}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.debug(message);

      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to open in editor. ${message}`,
      };
    }
  },
};
