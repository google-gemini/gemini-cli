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
import { TriageIssues } from '../components/triage/TriageIssues.js';

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
      action: async (context, args): Promise<OpenCustomDialogActionReturn> => {
        const { config } = context.services;
        if (!config) {
          throw new Error('Config not available');
        }

        let limit = 50;
        if (args && args.trim().length > 0) {
          const argArray = args.trim().split(/\s+/);
          const parsedLimit = parseInt(argArray[0], 10);
          if (!isNaN(parsedLimit) && parsedLimit > 0) {
            limit = parsedLimit;
          }
        }

        return {
          type: 'custom_dialog',
          component: (
            <TriageDuplicates
              config={config}
              initialLimit={limit}
              onExit={() => context.ui.removeComponent()}
            />
          ),
        };
      },
    },
    {
      name: 'audit',
      description: 'Triage issues labeled as status/need-triage',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context, args): Promise<OpenCustomDialogActionReturn> => {
        const { config } = context.services;
        if (!config) {
          throw new Error('Config not available');
        }

        let limit = 100;
        let until: string | undefined;

        if (args && args.trim().length > 0) {
          const argArray = args.trim().split(/\s+/);
          for (let i = 0; i < argArray.length; i++) {
            const arg = argArray[i];
            if (arg === '--until') {
              if (i + 1 >= argArray.length) {
                throw new Error('Flag --until requires a value (YYYY-MM-DD).');
              }
              const val = argArray[i + 1];
              if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                throw new Error(
                  `Invalid date format for --until: "${val}". Expected YYYY-MM-DD.`,
                );
              }
              until = val;
              i++;
            } else if (arg.startsWith('--')) {
              throw new Error(`Unknown flag: ${arg}`);
            } else {
              const parsedLimit = parseInt(arg, 10);
              if (!isNaN(parsedLimit) && parsedLimit > 0) {
                limit = parsedLimit;
              } else {
                throw new Error(
                  `Invalid argument: "${arg}". Expected a positive number or --until flag.`,
                );
              }
            }
          }
        }

        return {
          type: 'custom_dialog',
          component: (
            <TriageIssues
              config={config}
              initialLimit={limit}
              until={until}
              onExit={() => context.ui.removeComponent()}
            />
          ),
        };
      },
    },
  ],
};
