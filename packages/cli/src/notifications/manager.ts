/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { playSound } from './player.js';
import {
  NotificationSettings,
  NotificationEventType,
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationEventSettings,
} from './types.js';
import { loadSettings, SettingScope } from '../config/settings.js';
import { Config } from '@google/gemini-cli-core';
import * as os from 'os';

let currentSettings: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;

/**
 * Initializes the notification manager by loading settings.
 * @param config The Config object to load settings from.
 */
export function initNotifications(config: Config): void {
  try {
    const loadedSettings = loadSettings(config.getProjectRoot());
    const notificationSettings = loadedSettings.merged.notifications;
    if (notificationSettings) {
      currentSettings = {
        enabled:
          notificationSettings.enabled ?? DEFAULT_NOTIFICATION_SETTINGS.enabled,
        events: (
          Object.keys(
            DEFAULT_NOTIFICATION_SETTINGS.events,
          ) as NotificationEventType[]
        ).reduce(
          (acc, key) => {
            acc[key] = {
              ...DEFAULT_NOTIFICATION_SETTINGS.events[key],
              ...notificationSettings.events?.[key],
            };
            return acc;
          },
          {} as typeof DEFAULT_NOTIFICATION_SETTINGS.events,
        ),
      };
    }
  } catch (error) {
    console.error('Failed to load notification settings:', error);
    // Fallback to default settings on error
    currentSettings = DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Saves the current notification settings.
 * @param config The Config object to save settings to.
 */
export function saveNotificationSettings(config: Config): void {
  try {
    const loadedSettings = loadSettings(config.getProjectRoot());
    loadedSettings.setValue(
      SettingScope.User,
      'notifications',
      currentSettings,
    );
  } catch (error) {
    console.error('Failed to save notification settings:', error);
  }
}

/**
 * Triggers a notification for a specific event type.
 * @param eventType The type of notification event.
 */
export function triggerNotification(eventType: NotificationEventType): void {
  if (!currentSettings.enabled) {
    return; // Global notifications are disabled
  }

  const eventSettings = currentSettings.events[eventType];
  if (!eventSettings || !eventSettings.enabled) {
    return; // This specific event is disabled
  }

  let soundToPlay: string | undefined;

  if (eventSettings.sound === 'custom' && eventSettings.customPath) {
    soundToPlay = eventSettings.customPath;
  } else if (eventSettings.sound === 'system') {
    switch (os.platform()) {
      case 'darwin':
        soundToPlay =
          eventType === 'inputRequired'
            ? '/System/Library/Sounds/Glass.aiff'
            : '/System/Library/Sounds/Pop.aiff';
        break;
      case 'linux':
        soundToPlay =
          eventType === 'inputRequired'
            ? '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga'
            : '/usr/share/sounds/freedesktop/stereo/message.oga';
        break;
      case 'win32':
        soundToPlay =
          eventType === 'inputRequired'
            ? 'SystemAsterisk'
            : 'SystemExclamation';
        break;
      default:
        console.warn(`Audio notifications not supported on ${os.platform()}`);
        return;
    }
  }

  if (soundToPlay) {
    playSound(soundToPlay);
  }
}

/**
 * Returns the current notification settings.
 */
export function getNotificationSettings(): NotificationSettings {
  return currentSettings;
}

/**
 * Updates a specific notification event setting.
 * @param eventType The type of notification event to update.
 * @param updates Partial settings to apply.
 * @param config The Config object to save settings to.
 */
export function updateNotificationEventSettings(
  eventType: NotificationEventType,
  updates: Partial<NotificationEventSettings>,
  config: Config,
): void {
  if (currentSettings.events[eventType]) {
    currentSettings.events[eventType] = {
      ...currentSettings.events[eventType],
      ...updates,
    };
    saveNotificationSettings(config);
  }
}

/**
 * Enables or disables global notifications.
 * @param enabled Whether to enable or disable notifications.
 * @param config The Config object to save settings to.
 */
export function setGlobalNotificationsEnabled(
  enabled: boolean,
  config: Config,
): void {
  currentSettings.enabled = enabled;
  saveNotificationSettings(config);
}

/**
 * Plays a test notification sound/command.
 */
export function testNotifications(): string {
  triggerNotification('inputRequired');
  return 'Test notification triggered.';
}
