/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { performInit, checkExhaustive } from '@google/gemini-cli-core';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored GEMINI.md file',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const geminiMdPath = path.join(targetDir, 'GEMINI.md');

    const result = performInit({
      doesGeminiMdExist: () => fs.existsSync(geminiMdPath),
    });

    switch (result.type) {
      case 'info': {
        return {
          type: 'message',
          messageType: 'info',
          content: result.message,
        };
      }
      case 'error': {
        return {
          type: 'message',
          messageType: 'error',
          content: result.message,
        };
      }
      case 'new_file': {
        // Create an empty GEMINI.md file
        fs.writeFileSync(geminiMdPath, '', 'utf8');

        context.ui.addItem(
          {
            type: 'info',
            text: 'Empty GEMINI.md created. Now analyzing the project to populate it.',
          },
          Date.now(),
        );

        return {
          type: 'submit_prompt',
          content: result.prompt,
        };
      }
      default: {
        checkExhaustive(result);
      }
    }
  },
};
