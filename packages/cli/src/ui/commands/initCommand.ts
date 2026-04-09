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
import { performInit } from '@google/gemini-cli-core';

export const initCommand: SlashCommand = {
  name: 'init',
  description: 'Analyzes the project and creates a tailored GEMINI.md file',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.agentContext?.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.agentContext.config.getTargetDir();
    const geminiMdPath = path.join(targetDir, 'GEMINI.md');

    let fileHasContent = false;
    try {
      const content = await fs.promises.readFile(geminiMdPath, 'utf8');
      fileHasContent = content.trim().length > 0;
    } catch (e) {
      if (
        e instanceof Error &&
        (e as NodeJS.ErrnoException).code !== 'ENOENT'
      ) {
        return {
          type: 'message',
          messageType: 'error',
          content: `Failed to read GEMINI.md: ${e.message}`,
        };
      }
    }
    const result = performInit(fileHasContent);

    if (result.type === 'submit_prompt') {
      // Create an empty GEMINI.md file
      fs.writeFileSync(geminiMdPath, '', 'utf8');

      context.ui.addItem(
        {
          type: 'info',
          text: 'Empty GEMINI.md created. Now analyzing the project to populate it.',
        },
        Date.now(),
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return result as SlashCommandActionReturn;
  },
};
