/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '@google/gemini-cli-core';
import { SlashCommand } from './types.js';

export const ideCommand = (config: Config | null): SlashCommand | null => {
  if (!config?.getIdeMode()) {
    return null;
  }

  return {
    name: 'ide',
    description: 'Commands for interacting with the IDE.',
    subCommands: [
      {
        name: 'install',
        description: 'Install IDE extension.',
        action: async (context) => {
          context.ui.addItem(
            {
              type: 'info',
              text: 'Boilerplate text for ide install',
            },
            Date.now(),
          );
        },
      },
    ],
  };
};