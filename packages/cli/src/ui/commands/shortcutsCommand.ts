/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const shortcutsCommand: SlashCommand = {
  name: 'shortcuts',
  altNames: [],
  kind: CommandKind.BUILT_IN,
  description: 'Toggle the shortcuts panel above the input',
  autoExecute: true,
  action: (context) => {
    context.ui.toggleShortcutsHelp();
  },
};
