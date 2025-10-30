/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../../config/settings.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';

const VALID_COLOR_NAMES = new Set([
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'gray',
  'grey',
  'redBright',
  'greenBright',
  'yellowBright',
  'blueBright',
  'magentaBright',
  'cyanBright',
  'whiteBright',
]);

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}){1,2}$/;

export const responseColorCommand: SlashCommand = {
  name: 'ResponseColor',
  kind: CommandKind.BUILT_IN,
  description: 'Changes the color of the response text.',
  usage: 'ResponseColor <color|reset>',
  async action({ services, ui }, color) {
    if (!color) {
      ui.print('Please provide a color or "reset".');
      return;
    }

    if (color.toLowerCase() === 'reset') {
      services.settings.setValue(
        SettingScope.User,
        'ui.responseColor',
        undefined,
      );
      ui.print('Response color has been reset to the default.');
      return;
    }

    if (VALID_COLOR_NAMES.has(color) || HEX_COLOR_REGEX.test(color)) {
      services.settings.setValue(SettingScope.User, 'ui.responseColor', color);
      ui.print(`Response color set to ${color}.`);
    } else {
      ui.print(
        'Invalid color. Please use a valid color name or a hex code (e.g., #FF5733).',
      );
    }
  },
};
