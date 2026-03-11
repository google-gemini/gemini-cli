/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionStartSource } from '@google/gemini-cli-core';
import { createNewSession } from '../../utils/sessionUtils.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const newCommand: SlashCommand = {
  name: 'new',
  description: 'Start a fresh chat session',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, _args) => {
    await createNewSession(context, SessionStartSource.New, false);
  },
};
