/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OpenDialogActionReturn,
  SlashCommand,
  LogoutActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  clearCachedCredentialFile,
  UserAccountManager,
  AuthType,
} from '@google/gemini-cli-core';
import type { MessageActionReturn } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';

const authLoginCommand: SlashCommand = {
  name: 'login',
  description: 'Login or change the auth method',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'auth',
  }),
};

const authLogoutCommand: SlashCommand = {
  name: 'logout',
  description: 'Log out and clear all cached credentials',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<LogoutActionReturn> => {
    await clearCachedCredentialFile();
    // Clear the selected auth type so user sees the auth selection menu
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      undefined,
    );
    // Strip thoughts from history instead of clearing completely
    context.services.config?.getGeminiClient()?.stripThoughtsFromHistory();
    // Return logout action to signal explicit state change
    return {
      type: 'logout',
    };
  },
};

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Manage authentication',
  kind: CommandKind.BUILT_IN,
  subCommands: [authLoginCommand, authLogoutCommand],
  action: (context, _args): MessageActionReturn | OpenDialogActionReturn => {
    // If no subcommand is provided, show current account info
    const selectedAuthType =
      context.services.settings.merged.security.auth.selectedType;
    const authType =
      context.services.config?.getContentGeneratorConfig()?.authType;

    // Show account info for Google login
    if (
      authType === AuthType.LOGIN_WITH_GOOGLE ||
      selectedAuthType === 'oauth-personal'
    ) {
      const userAccountManager = new UserAccountManager();
      const cachedAccount = userAccountManager.getCachedGoogleAccount();

      if (cachedAccount) {
        return {
          type: 'message',
          messageType: 'info',
          content: `Currently authenticated with Google account: ${cachedAccount}\n\nUse \`/auth login\` to change authentication method.\nUse \`/auth logout\` to log out.`,
        };
      } else {
        return {
          type: 'message',
          messageType: 'info',
          content:
            'Logged in with Google (account email not available)\n\nUse `/auth login` to change authentication method.\nUse `/auth logout` to log out.',
        };
      }
    }

    // For other auth types, show current auth method
    if (selectedAuthType) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Current authentication method: ${selectedAuthType}\n\nUse \`/auth login\` to change authentication method.\nUse \`/auth logout\` to log out.`,
      };
    }

    // No auth selected, open dialog
    return {
      type: 'dialog',
      dialog: 'auth',
    };
  },
};
