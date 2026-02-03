/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const shellsCommand: SlashCommand = {
  name: 'shells',
  altNames: ['bashes'],
  kind: CommandKind.BUILT_IN,
  description: 'Toggle background shells view',
  autoExecute: true,
  action: async (context) => {
    context.ui.toggleBackgroundShell();
  },
};
