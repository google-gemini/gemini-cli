/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';

export const corgiCommand: SlashCommand = {
  name: 'corgi',
  description: 'Toggles corgi mode.',
  hidden: true,
  kind: CommandKind.BUILT_IN,
  action: (context, _args) => {
    context.ui.toggleCorgiMode();
  },
};
