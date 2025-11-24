/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';
import { playSound, type SoundConfig, type PlaySoundResult } from './player.js';
import { debugLogger } from '@google/gemini-cli-core';

export type NotificationEventType =
  | 'inputRequired'
  | 'taskComplete'
  | 'idleAlert';

export interface NotificationEventConfig {
  enabled: boolean;
  sound: 'system' | 'custom';
  customPath?: string;
  timeout?: number; // For idleAlert
}

export interface NotificationSettings {
  enabled: boolean;
  events: {
    inputRequired?: NotificationEventConfig;
    taskComplete?: NotificationEventConfig;
    idleAlert?: NotificationEventConfig;
  };
}

/**
 * Manages audio notifications for various events in the CLI.
 */
export class NotificationManager {
  private settings: NotificationSettings;
  private idleTimer: NodeJS.Timeout | null = null;
  private isIdleAlertActive: boolean = false;

  constructor(settings: LoadedSettings) {
    this.settings = this.loadSettings(settings);
  }

  /**
   * Updates the notification manager with new settings.
   */
  updateSettings(settings: LoadedSettings): void {
    this.settings = this.loadSettings(settings);
    // Don't restart idle timer on settings update - only restart if already running
    if (this.idleTimer) {
      this.updateIdleTimer();
    }
  }

  /**
   * Triggers a notification for the given event type.
   */
  async notify(eventType: NotificationEventType): Promise<PlaySoundResult> {
    if (!this.settings.enabled) {
      return { fallbackUsed: false };
    }

    const eventConfig = this.settings.events[eventType];
    if (!eventConfig || !eventConfig.enabled) {
      return { fallbackUsed: false };
    }

    debugLogger.debug(`[Notifications] Triggering ${eventType} notification`);

    const soundConfig: SoundConfig = {
      sound: eventConfig.sound,
      customPath: eventConfig.customPath,
    };

    return await playSound(soundConfig, eventType);
  }

  /**
   * Starts the idle timer. Should be called after sending inputRequired or taskComplete notifications.
   * The timer will trigger an idleAlert if the user doesn't focus on the terminal within the timeout.
   */
  startIdleTimer(): void {
    this.isIdleAlertActive = false;
    this.updateIdleTimer();
  }

  /**
   * Cancels the idle timer. Call this when user focuses on the terminal or provides input.
   */
  cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.isIdleAlertActive = false;
  }

  /**
   * Resets the idle timer. Call this when user input is received.
   * @deprecated Use cancelIdleTimer() instead - idle timer should only start after notifications
   */
  resetIdleTimer(): void {
    this.cancelIdleTimer();
  }

  /**
   * Updates the idle timer based on current settings.
   * Sets a timer for the full timeout duration from now.
   */
  private updateIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    const idleConfig = this.settings.events.idleAlert;
    if (
      !this.settings.enabled ||
      !idleConfig ||
      !idleConfig.enabled ||
      !idleConfig.timeout
    ) {
      return;
    }

    const timeoutMs = idleConfig.timeout * 1000; // Convert seconds to milliseconds

    // Set timer for the full timeout duration
    // This will trigger an idleAlert if user doesn't focus within the timeout
    this.idleTimer = setTimeout(() => {
      this.triggerIdleAlert();
    }, timeoutMs);
  }

  /**
   * Triggers an idle alert notification.
   * This is the final notification if user hasn't focused after receiving inputRequired/taskComplete.
   */
  private async triggerIdleAlert(): Promise<void> {
    if (this.isIdleAlertActive) {
      return; // Prevent multiple alerts
    }

    this.isIdleAlertActive = true;
    await this.notify('idleAlert');

    // Don't restart the timer - idle alert is the final notification
    // Timer will only restart if a new inputRequired/taskComplete notification is sent
  }

  /**
   * Cleans up resources.
   */
  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Loads notification settings from LoadedSettings.
   */
  private loadSettings(settings: LoadedSettings): NotificationSettings {
    const notifications = (
      settings.merged as {
        general?: {
          notifications?: {
            enabled?: boolean;
            events?: {
              inputRequired?: {
                enabled?: boolean;
                sound?: 'system' | 'custom';
                customPath?: string;
              };
              taskComplete?: {
                enabled?: boolean;
                sound?: 'system' | 'custom';
                customPath?: string;
              };
              idleAlert?: {
                enabled?: boolean;
                sound?: 'system' | 'custom';
                customPath?: string;
                timeout?: number;
              };
            };
          };
        };
      }
    ).general?.notifications;

    if (!notifications) {
      return this.getDefaultSettings();
    }

    return {
      enabled: notifications.enabled ?? false,
      events: {
        inputRequired: notifications.events?.inputRequired
          ? {
              enabled: notifications.events.inputRequired.enabled ?? true,
              sound: notifications.events.inputRequired.sound ?? 'system',
              customPath: notifications.events.inputRequired.customPath,
            }
          : undefined,
        taskComplete: notifications.events?.taskComplete
          ? {
              enabled: notifications.events.taskComplete.enabled ?? true,
              sound: notifications.events.taskComplete.sound ?? 'system',
              customPath: notifications.events.taskComplete.customPath,
            }
          : undefined,
        idleAlert: notifications.events?.idleAlert
          ? {
              enabled: notifications.events.idleAlert.enabled ?? true,
              sound: notifications.events.idleAlert.sound ?? 'system',
              customPath: notifications.events.idleAlert.customPath,
              timeout: notifications.events.idleAlert.timeout ?? 60,
            }
          : undefined,
      },
    };
  }

  /**
   * Returns default notification settings.
   */
  private getDefaultSettings(): NotificationSettings {
    return {
      enabled: false,
      events: {
        inputRequired: {
          enabled: true,
          sound: 'system',
        },
        taskComplete: {
          enabled: true,
          sound: 'system',
        },
        idleAlert: {
          enabled: true,
          sound: 'system',
          timeout: 60,
        },
      },
    };
  }

  /**
   * Gets the current notification configuration.
   */
  getStatus(): NotificationSettings {
    return { ...this.settings };
  }
}
