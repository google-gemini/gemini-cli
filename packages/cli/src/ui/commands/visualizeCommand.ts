/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemVisualizeDeps } from '../types.js';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

export const visualizeCommand: SlashCommand = {
  name: 'visualize',
  altNames: ['viz'],
  description: 'Visualize project data. Usage: /visualize [deps]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context: CommandContext) => {
    context.ui.addItem({
      type: MessageType.VISUALIZE_DEPS,
    } as HistoryItemVisualizeDeps);
  },
  subCommands: [
    {
      name: 'deps',
      description: 'Show dependency graph from package.json',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.VISUALIZE_DEPS,
        } as HistoryItemVisualizeDeps);
      },
    },
  ],
};
