/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import process from 'node:process';
import os from 'node:os';

export const terminalCommand: SlashCommand = {
  name: 'terminal',
  description: 'Launch an interactive terminal session',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args) => {
    let shell = args.trim();
    if (!shell) {
      shell =
        process.env['SHELL'] ||
        (os.platform() === 'win32' ? 'powershell.exe' : 'bash');
    }
    return {
      type: 'execute_shell',
      command: shell,
      forcePty: true,
    };
  },
};
