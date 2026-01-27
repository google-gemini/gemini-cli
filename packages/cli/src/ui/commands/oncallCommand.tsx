/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type OpenCustomDialogActionReturn,
} from './types.js';
import { TriageDuplicates } from '../components/triage/TriageDuplicates.js';

export const oncallCommand: SlashCommand = {
  name: 'oncall',
  description: 'Oncall related commands',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'dedup',
      description: 'Triage issues labeled as status/possible-duplicate',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context): Promise<OpenCustomDialogActionReturn> => {
        const { config } = context.services;
        if (!config) {
          throw new Error('Config not available');
        }

        return {
          type: 'custom_dialog',
          component: (
            <TriageDuplicates
              config={config}
              onExit={() => context.ui.removeComponent()}
            />
          ),
        };
      },
    },
  ],
};
