/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  MessageActionReturn,
  OpenDialogActionReturn,
  SlashCommand,
} from './types.js';
import { CommandKind } from './types.js';

export const permissionsCommand: SlashCommand = {
  name: 'permissions',
  description: 'Manage folder trust settings',
  kind: CommandKind.BUILT_IN,
  action: (context): OpenDialogActionReturn | MessageActionReturn => {
    const isFolderTrustEnabled =
      !!context.services.settings.merged.security?.folderTrust?.enabled;
    if (!isFolderTrustEnabled) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Folder trust is disabled. You can enable it in the settings.',
      };
    }
    return {
      type: 'dialog',
      dialog: 'permissions',
    };
  },
};
