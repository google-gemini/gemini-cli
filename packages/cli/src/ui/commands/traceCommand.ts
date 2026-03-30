/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

export const traceCommand: SlashCommand = {
  name: 'trace',
  altNames: ['perf'],
  description: 'Inspect the current session execution summary',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: (context: CommandContext) => {
    context.ui.addItem({
      type: 'trace',
    });
  },
};
