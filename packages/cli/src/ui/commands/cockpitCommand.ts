/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { toggleCockpit } from '../cockpit/CockpitState.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

export const cockpitCommand: SlashCommand = {
  name: 'cockpit',
  description: 'Toggle the gemini-code cockpit overlay.',
  kind: CommandKind.BUILT_IN,
  isSafeConcurrent: true,
  takesArgs: false,
  action: async (): Promise<SlashCommandActionReturn> => {
    const visible = toggleCockpit();

    return {
      type: 'message',
      messageType: 'info',
      content: `Cockpit overlay ${visible ? 'enabled' : 'disabled'}.`,
    };
  },
};
