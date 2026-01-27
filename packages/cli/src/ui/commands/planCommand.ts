/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

export const planCommand: SlashCommand = {
  name: 'plan',
  description: 'Manage implementation plans',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'discard',
      description: 'Discard all plan files in the current session',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context) => {
        const config = context.services.config;
        if (!config) return;

        const plansDir = config.storage.getProjectTempPlansDir();
        try {
          if (fs.existsSync(plansDir)) {
            const files = await fs.promises.readdir(plansDir);
            const mdFiles = files.filter((f) => f.endsWith('.md'));

            for (const file of mdFiles) {
              await fs.promises.unlink(path.join(plansDir, file));
            }

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `Discarded ${mdFiles.length} plan file(s).`,
              },
              Date.now(),
            );
          } else {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No plan files found to discard.',
              },
              Date.now(),
            );
          }
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to discard plans: ${(error as Error).message}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};
