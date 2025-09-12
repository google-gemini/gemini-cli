/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines the structure for individual notification event settings.
 */
export interface NotificationEventSettings {
  enabled: boolean;
  command: string; // Command to execute for the notification
  customPath?: string; // Optional path for custom sound files (if command is a sound player)
  timeout?: number; // Optional timeout for idle alerts
}

/**
 * Defines the structure for the overall notification configuration.
 */
export interface NotificationSettings {
  enabled: boolean;
  events: {
    inputRequired: NotificationEventSettings;
    taskComplete: NotificationEventSettings;
    idleAlert: NotificationEventSettings;
  };
}

/**
 * Defines the event types for notifications.
 */
export type NotificationEventType = 'inputRequired' | 'taskComplete' | 'idleAlert';

/**
 * Default notification settings.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  events: {
    inputRequired: {
      enabled: true,
      command: 'system', // Placeholder for system default sound/command
    },
    taskComplete: {
      enabled: false,
      command: 'system',
    },
    idleAlert: {
      enabled: true,
      command: 'system',
      timeout: 60, // seconds
    },
  },
};
