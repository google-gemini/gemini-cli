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

    if (fs.existsSync(geminiMdPath)) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'A GEMINI.md file already exists in this directory. No changes were made.',
      };
    }

    const template = `# GEMINI.md

## Project Identity
This is the active workspace for this codebase.

## Rules
- Prefer small, reviewable diffs.
- Never rewrite large files unless asked.
- Run tests after edits when possible.
- Explain what changed and why.
- Preserve existing architecture unless the user requests a refactor.

## User Preferences
- Fast, practical fixes.
- No fake placeholder features.
- Keep output direct and patch-oriented.
`;

    fs.writeFileSync(geminiMdPath, template, 'utf8');

    return performInit(false);
  },
};
