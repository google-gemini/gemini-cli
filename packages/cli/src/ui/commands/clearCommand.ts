/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'clear the screen',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    context.ui.setDebugMessage('Clearing terminal.');
    context.ui.clear();
  },
};
