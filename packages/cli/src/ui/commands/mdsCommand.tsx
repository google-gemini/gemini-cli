/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MdsBrowser } from '../components/MdsBrowser.js';

export const mdsCommand: SlashCommand = {
  name: 'mds',
  description: 'Lists all GEMINI.md and AGENTS.md files in use',
  kind: CommandKind.BUILT_IN,
  action: async (context) => ({
    type: 'custom_dialog',
    component: (
      <MdsBrowser
        config={context.services.config!}
        onClose={context.ui.removeComponent}
      />
    ),
  }),
};
