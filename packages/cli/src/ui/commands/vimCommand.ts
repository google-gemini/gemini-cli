/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from './types.js';

export const vimCommand: SlashCommand = {
  name: 'vim',
  description: 'toggle vim mode on/off',
  action: async (context, _args) => {
    const { toggleVimMode } = context.ui;

    toggleVimMode();

    // No message - silent toggle
  },
};
