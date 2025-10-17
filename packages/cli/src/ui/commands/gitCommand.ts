/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

const commitSubCommand: SlashCommand = {
  name: 'commit',
  description: 'Generate a commit message for the currently staged changes.',
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    _args,
  ): Promise<SlashCommandActionReturn | void> => {
    const { execa } = await import('execa');
    try {
      const { stdout: diff } = await execa('git', ['diff', '--staged']);
      if (!diff) {
        return {
          type: 'message',
          messageType: 'info',
          content: 'There are no staged changes to commit.',
        };
      }

      const prompt = `Based on the following git diff, please generate a conventional commit message.

${diff}`;

      return {
        type: 'prompt',
        prompt,
      };
    } catch (e) {
      const error = e as Error;
      return {
        type: 'message',
        messageType: 'error',
        content: `Error getting git diff: ${error.message}`,
      };
    }
  },
};

export const gitCommand: SlashCommand = {
  name: 'git',
  description: 'Git-related commands.',
  kind: CommandKind.BUILT_IN,
  subCommands: [commitSubCommand],
};