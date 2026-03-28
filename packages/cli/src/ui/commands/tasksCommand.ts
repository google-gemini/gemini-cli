/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const tasksCommand: SlashCommand = {
  name: 'tasks',
  altNames: ['bg', 'background'],
  kind: CommandKind.BUILT_IN,
  description: 'Toggle background tasks view',
  autoExecute: true,
  action: async (context) => {
    context.ui.toggleBackgroundTasks();
  },
};
