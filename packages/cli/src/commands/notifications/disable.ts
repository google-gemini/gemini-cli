/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setGlobalNotificationsEnabled, initNotifications } from '../../notifications/manager.js';
import { loadSettings } from '../../config/settings.js';
import { CommandModule } from 'yargs';

export const disableCommand: CommandModule = {
  command: 'disable',
  describe: 'Disable all notifications',
  handler: async () => {
    const settings = loadSettings(process.cwd());
    initNotifications(settings);
    setGlobalNotificationsEnabled(false, settings);
    console.log('All audio notifications have been disabled.');
  },
};
