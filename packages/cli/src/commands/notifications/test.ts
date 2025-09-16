/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { testNotifications } from '../../notifications/manager.js';

export const testCommand: CommandModule = {
  command: 'test',
  describe: 'Test current notification settings',
  handler: async () => {
    const message = testNotifications();
    console.log(message);
  },
};
