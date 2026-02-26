/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import type { HistoryItemColors } from '../types.js';

export const colorsCommand: SlashCommand = {
  name: 'colors',
  description: 'Visualize the current theme colors',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (context) => {
    context.ui.addItem({
      type: 'colors',
      timestamp: new Date(),
    } as HistoryItemColors);
  },
};
