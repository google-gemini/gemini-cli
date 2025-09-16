/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { initNotifications, setGlobalNotificationsEnabled } from '../../notifications/manager.js';
import { getConfig } from '../../config/config.js';

export const disableCommand: CommandModule = {
  command: 'disable',
  describe: 'Disable all notifications',
  handler: async () => {
    const config = await getConfig();
    initNotifications(config);
    setGlobalNotificationsEnabled(false, config);
    console.log('All audio notifications have been disabled.');
  },
};
