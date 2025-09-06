/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Select and switch Gemini models interactively',
  kind: CommandKind.BUILT_IN,
  action: (): SlashCommandActionReturn => ({
    type: 'dialog',
    dialog: 'model',
  }),
};
