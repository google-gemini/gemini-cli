/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { triggerNotification } from './manager.js';
import { getNotificationSettings } from './manager.js';

let idleTimer: NodeJS.Timeout | undefined;

/**
 * Starts the idle timer based on the current settings.
 * This should be called when the application becomes idle and is waiting for user input.
 */
export function startIdleTimer(): void {
  const currentSettings = getNotificationSettings();
  if (!currentSettings.enabled || !currentSettings.events.idleAlert.enabled) {
    return;
  }

  // Stop any existing timer before starting a new one.
  stopIdleTimer();

  const timeoutInSeconds = currentSettings.events.idleAlert.timeout ?? 60;
  const timeoutInMs = timeoutInSeconds * 1000;

  if (timeoutInMs > 0) {
    idleTimer = setTimeout(() => {
      triggerNotification('idleAlert');
    }, timeoutInMs);
  }
}

/**
 * Stops the idle timer.
 * This should be called when the application is no longer idle (e.g., user provides input).
 */
export function stopIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
}
