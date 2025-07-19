/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SlashCommandDefinition } from './types.js';

export const corgiCommand: SlashCommandDefinition = {
  name: 'corgi',
  description: 'Toggles corgi mode.',
  action: (context, _args) => {
    context.ui.toggleCorgiMode();
  },
};
