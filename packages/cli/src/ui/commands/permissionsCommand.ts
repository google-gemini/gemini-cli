/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OpenDialogActionReturn,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import * as process from 'node:process';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

export const permissionsCommand: SlashCommand = {
  name: 'permissions',
  description: 'Manage folder trust settings and other permissions',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'trust',
      description:
        'Manage folder trust settings. Usage: /permissions trust [<directory-path>]',
      kind: CommandKind.BUILT_IN,
      action: (context, input): SlashCommandActionReturn => {
        const dirPath = input.trim();
        let targetDirectory: string;

        if (!dirPath) {
          targetDirectory = process.cwd();
        } else if (dirPath.startsWith('~')) {
          targetDirectory = path.join(os.homedir(), dirPath.slice(1));
        } else {
          targetDirectory = path.resolve(dirPath);
        }

        try {
          if (!fs.statSync(targetDirectory).isDirectory()) {
            return {
              type: 'message',
              messageType: 'error',
              content: `Path is not a directory: ${targetDirectory}`,
            };
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            type: 'message',
            messageType: 'error',
            content: `Error accessing path: ${targetDirectory}. ${message}`,
          };
        }

        return {
          type: 'dialog',
          dialog: 'permissions',
          props: {
            targetDirectory,
          },
        } as OpenDialogActionReturn;
      },
    },
  ],
  action: (context, input): SlashCommandActionReturn => {
    const parts = input.trim().split(' ');
    const subcommand = parts[0];

    if (!subcommand) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Please provide a subcommand for /permissions. Usage: /permissions trust [<directory-path>]`,
      };
    }

    return {
      type: 'message',
      messageType: 'error',
      content: `Invalid subcommand for /permissions: ${subcommand}. Usage: /permissions trust [<directory-path>]`,
    };
  },
};
