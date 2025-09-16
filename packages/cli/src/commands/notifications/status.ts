/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { getNotificationSettings } from '../../notifications/manager.js';
import { NotificationEventType } from '../../notifications/types.js';

export const statusCommand: CommandModule = {
  command: 'status',
  describe: 'Show current notification configuration',
  handler: async () => {
    const settings = getNotificationSettings();

    let statusMessage = 'Current Notification Settings:\n';
    statusMessage += `  Global Enabled: ${settings.enabled}\n`;
    statusMessage += '  Event Triggers:\n';
    for (const key in settings.events) {
      const eventType = key as NotificationEventType;
      const eventSettings = settings.events[eventType];
      statusMessage += `    - ${eventType}:\n`;
      statusMessage += `        Enabled: ${eventSettings.enabled}\n`;
      statusMessage += `        Sound: ${eventSettings.sound}\n`;
      if (eventSettings.sound === 'custom' && eventSettings.customPath) {
        statusMessage += `        Custom Path: ${eventSettings.customPath}\n`;
      }
      if (eventType === 'idleAlert' && 'timeout' in eventSettings) {
        statusMessage += `        Timeout: ${eventSettings.timeout} seconds\n`;
      }
    }
    console.log(statusMessage);
  },
};
