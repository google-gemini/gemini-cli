/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogoutActionReturn, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { clearCachedCredentialFile } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';

export const logoutCommand: SlashCommand = {
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
    return {
      type: 'logout',
    };
  },
};
