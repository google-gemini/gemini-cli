/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

/**
 * Slash command to manage agent teams.
 */
export const teamCommand: SlashCommand = {
  name: 'team',
  description: 'Manage agent teams',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'select',
      description: 'Open the team selection dialog',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (): Promise<SlashCommandActionReturn> => ({
          type: 'dialog',
          dialog: 'teamSelection',
        }),
    },
    {
      name: 'create',
      description: 'Create a new agent team interactively',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (): Promise<SlashCommandActionReturn> => ({
          type: 'dialog',
          dialog: 'teamCreator',
        }),
    },
  ],
};
