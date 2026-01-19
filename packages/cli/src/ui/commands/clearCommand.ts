/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { startNewSession } from '../../utils/sessionUtils.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { SessionStartSource } from '@google/gemini-cli-core';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the screen and conversation history',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    // clearScreen is true for /clear
    await startNewSession(context, SessionStartSource.Clear, true);
  },
};
