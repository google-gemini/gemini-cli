/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getNotificationSettings, initNotifications } from '../../notifications/manager.js';
import { NotificationEventType } from '../../notifications/types.js';
import { loadSettings } from '../../config/settings.js';
import { CommandModule } from 'yargs';

export const statusCommand: CommandModule = {
  command: 'status',
  describe: 'Show current notification configuration',
  handler: async () => {
    const settings = loadSettings(process.cwd());
    initNotifications(settings);
    const notificationSettings = getNotificationSettings();

    let statusMessage = 'Current Notification Settings:\n';
    statusMessage += `  Global Enabled: ${notificationSettings.enabled}\n`;
    statusMessage += '  Event Triggers:\n';
    (Object.keys(notificationSettings.events) as NotificationEventType[]).forEach(
      (eventType) => {
        const eventSettings = notificationSettings.events[eventType];
        statusMessage += `    - ${eventType}:\n`;
        statusMessage += `        Enabled: ${eventSettings.enabled}\n`;
        statusMessage += `        Sound: ${eventSettings.sound}\n`;
        if (eventSettings.sound === 'custom' && eventSettings.customPath) {
          statusMessage += `        Custom Path: ${eventSettings.customPath}\n`;
        }
        if (eventType === 'idleAlert' && 'timeout' in eventSettings) {
          statusMessage += `        Timeout: ${eventSettings.timeout} seconds\n`;
        }
      },
    );
    console.log(statusMessage);
  },
};
