/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const shortcutsCommand: SlashCommand = {
  name: 'shortcuts',
  altNames: [],
  kind: CommandKind.BUILT_IN,
  description: 'Toggle the shortcuts panel above the input',
  autoExecute: true,
  argsSpec: { max: 0 },
  action: (context) => {
    context.ui.toggleShortcutsHelp();
  },
};
