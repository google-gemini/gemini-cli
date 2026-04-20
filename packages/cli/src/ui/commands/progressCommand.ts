/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemProgressTree } from '../types.js';
import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

export const progressCommand: SlashCommand = {
  name: 'progress',
  altNames: [],
  description: 'Show session progress tree. Usage: /progress [tree]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: (context: CommandContext) => {
    context.ui.addItem({
      type: MessageType.PROGRESS_TREE,
    } as HistoryItemProgressTree);
  },
  subCommands: [
    {
      name: 'tree',
      description: 'Show hierarchical tool call tree for this session',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.PROGRESS_TREE,
        } as HistoryItemProgressTree);
      },
    },
  ],
};
