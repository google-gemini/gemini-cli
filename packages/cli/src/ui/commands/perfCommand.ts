/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Dashboard } from '../dashboard.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

export const perfCommand: SlashCommand = {
  name: 'perf',
  description: 'Show in-CLI performance monitoring dashboard',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => ({
    type: 'custom_dialog',
    component: React.createElement(Dashboard, {
      live: true,
      onExit: () => context.ui.removeComponent(),
    }),
  }),
};
