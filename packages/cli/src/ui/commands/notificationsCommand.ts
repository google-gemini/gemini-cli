/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, CommandContext, SlashCommandActionReturn } from './types.js';
import { getNotificationSettings, setGlobalNotificationsEnabled, testNotifications } from '../../notifications/manager.js';
import { NotificationEventType } from '../../notifications/types.js';

// Subcommands for /notifications
const setupCommand: SlashCommand = {
  name: 'setup',
  description: 'Interactive setup for notification preferences',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): SlashCommandActionReturn => {
    // For now, a basic prompt. Full interactive setup would be more complex.
    return { type: 'message', content: 'Interactive setup for notifications is not yet fully implemented. Please use /notifications status to view current settings.' };
  },
};

const testCommand: SlashCommand = {
  name: 'test',
  description: 'Test current notification settings',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): SlashCommandActionReturn => {
    const message = testNotifications();
    return { type: 'message', content: message };
  },
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable all notifications',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): SlashCommandActionReturn => {
    if (!context.services.config) {
      return { type: 'message', content: 'Cannot disable notifications: Configuration service is not available.', messageType: 'error' };
    }
    setGlobalNotificationsEnabled(false, context.services.config);
    return { type: 'message', content: 'All audio notifications have been disabled.' };
  },
};

const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show current notification configuration',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): SlashCommandActionReturn => {
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

    return { type: 'message', content: statusMessage };
  },
};

export const notificationsCommand: SlashCommand = {
  name: 'notifications',
  description: 'Manage audio notification settings',
  kind: CommandKind.BUILT_IN,
  subCommands: [setupCommand, testCommand, disableCommand, statusCommand],
  action: (context: CommandContext, args: string): SlashCommandActionReturn => {
    // If no subcommand is provided, show help or default to status
    if (!args || args.trim() === '') {
      return { type: 'message', content: 'Please provide a subcommand for /notifications: setup, test, disable, or status.' };
    }
    return { type: 'message', content: 'Unknown subcommand for /notifications. Use setup, test, disable, or status.' };
  },
};