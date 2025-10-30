/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../../config/settings.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

export const colorCommand: SlashCommand = {
  name: 'color',
  kind: CommandKind.BUILT_IN,
  description: 'Changes the color of the response text.',
  usage: 'color <color>',
  async action({ services, ui }, color) {
    if (!color) {
      ui.print('Please provide a color.');
      return;
    }

    services.settings.setValue(SettingScope.User, 'ui.responseColor', color);
    ui.print(`Response color set to ${color}.`);
  },
};
