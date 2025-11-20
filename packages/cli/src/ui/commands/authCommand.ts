/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenDialogActionReturn, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { clearCachedCredentialFile } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';

const authChangeCommand: SlashCommand = {
  name: 'change',
  description: 'Change the auth method',
  kind: CommandKind.BUILT_IN,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'auth',
  }),
};

const authLogoutCommand: SlashCommand = {
  name: 'logout',
  description: 'Log out and clear all cached credentials',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<OpenDialogActionReturn> => {
    await clearCachedCredentialFile();
    // Clear the selected auth type so user sees the auth selection menu
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      undefined,
    );
    // Strip thoughts from history instead of clearing completely
    context.services.config?.getGeminiClient()?.stripThoughtsFromHistory();
    // Return dialog action to show auth selection menu
    return {
      type: 'dialog',
      dialog: 'auth',
    };
  },
};

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Manage authentication',
  kind: CommandKind.BUILT_IN,
  subCommands: [authChangeCommand, authLogoutCommand],
  action: (context, args) =>
    // Default to change if no subcommand is provided
    authChangeCommand.action!(context, args),
};
