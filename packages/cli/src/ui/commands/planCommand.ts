/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, MessageActionReturn } from './types.js';

export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'toggle plan mode',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<MessageActionReturn> => {
    return new Promise((resolve) => {
      context.ui.setIsPlanMode((prev) => {
        const newMode = !prev;
        
        // Update the config with the new plan mode state
        context.services.config?.setIsPlanMode(newMode);
        
        resolve({
          type: 'message',
          messageType: 'info',
          content: `Plan mode ${newMode ? 'enabled' : 'disabled'}.`,
        });
        return newMode;
      });
    });
  },
};
