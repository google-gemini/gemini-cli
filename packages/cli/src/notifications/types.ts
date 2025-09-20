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
  sound: 'system' | 'custom';
  customPath?: string; // Path to custom sound file, only if sound is 'custom'
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
      sound: 'system',
    },
    taskComplete: {
      enabled: false,
      sound: 'system',
    },
    idleAlert: {
      enabled: true,
      sound: 'system',
      timeout: 60, // seconds
    },
  },
};
