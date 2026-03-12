/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  openBrowserSecurely,
  shouldLaunchBrowser,
  UPGRADE_URL_PAGE,
} from '@google/gemini-cli-core';
import { CommandKind, type SlashCommand } from './types.js';

/**
 * Command to open the upgrade page for Gemini Code Assist.
 * Only intended to be shown/available when the user is logged in with Google.
 */
export const upgradeCommand: SlashCommand = {
  name: 'upgrade',
  kind: CommandKind.BUILT_IN,
  description: 'Upgrade your Gemini Code Assist tier for higher limits',
  autoExecute: true,
  action: async (context) => {
    const authType =
      context.services.config?.getContentGeneratorConfig()?.authType;
    if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
      // This command should ideally be hidden if not logged in with Google,
      // but we add a safety check here just in case.
      return {
        type: 'message',
        messageType: 'error',
        content:
          'The /upgrade command is only available when logged in with Google.',
      };
    }

    if (!shouldLaunchBrowser()) {
      return {
        type: 'message',
        messageType: 'info',
        content: `Please open this URL in a browser: ${UPGRADE_URL_PAGE}`,
      };
    }

    try {
      await openBrowserSecurely(UPGRADE_URL_PAGE);
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to open upgrade page: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return undefined;
  },
};
