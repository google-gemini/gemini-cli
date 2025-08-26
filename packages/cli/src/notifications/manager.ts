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
import { loadSettings, SettingScope } from '../../config/settings.js';
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
    if (loadedSettings.merged.notifications) {
      currentSettings = loadedSettings.merged
        .notifications as NotificationSettings;
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
      SettingScope.USER,
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

  // Use the command directly if it's not a system sound
  if (eventSettings.command !== 'system') {
    playSound(eventSettings.command, true); // Treat as direct command
  } else {
    // Handle system sounds (platform-specific defaults)
    let systemSoundPath: string | undefined;
    switch (os.platform()) {
      case 'darwin':
        systemSoundPath =
          eventType === 'inputRequired'
            ? '/System/Library/Sounds/Glass.aiff'
            : '/System/Library/Sounds/Pop.aiff';
        break;
      case 'linux':
        systemSoundPath =
          eventType === 'inputRequired'
            ? '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga' // A more urgent sound for input required
            : '/usr/share/sounds/freedesktop/stereo/message.oga'; // A general notification sound
        break;
      case 'win32':
        systemSoundPath =
          eventType === 'inputRequired'
            ? 'SystemAsterisk'
            : 'SystemExclamation';
        playSound(
          `(New-Object Media.SystemSounds).${systemSoundPath}.Play()`,
          true,
        );
        return;
      default:
        console.warn(`Audio notifications not supported on ${os.platform()}`);
        return;
    }
    if (systemSoundPath) {
      playSound(systemSoundPath, false);
    }
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
