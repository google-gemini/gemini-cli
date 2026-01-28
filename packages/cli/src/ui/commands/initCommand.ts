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
import { t } from '../../i18n/index.js';
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
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('commands:init.responses.configFailed'),
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const geminiMdPath = path.join(targetDir, 'GEMINI.md');

    const result = performInit(fs.existsSync(geminiMdPath));

    if (result.type === 'submit_prompt') {
      // Create an empty GEMINI.md file
      fs.writeFileSync(geminiMdPath, '', 'utf8');

      context.ui.addItem(
        {
          type: 'info',
          text: t('commands:init.responses.created'),
        },
        Date.now(),
      );
    }

    return result as SlashCommandActionReturn;
  },
};
