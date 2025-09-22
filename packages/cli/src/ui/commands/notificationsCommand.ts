/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
  type SlashCommandActionReturn,
} from './types.js';
import {
  getNotificationSettings,
  setGlobalNotificationsEnabled,
  testNotifications,
} from '../../notifications/manager.js';
import { type NotificationEventType } from '../../notifications/types.js';

// Subcommands for /notifications
const setupCommand: SlashCommand = {
  name: 'setup',
  description: 'Interactive setup for notification preferences',
  kind: CommandKind.BUILT_IN,
  action: (): SlashCommandActionReturn => ({
    type: 'dialog',
    dialog: 'notifications-setup',
  }),
};

const testCommand: SlashCommand = {
  name: 'test',
  description: 'Test current notification settings',
  kind: CommandKind.BUILT_IN,
  action: (): SlashCommandActionReturn => {
    const message = testNotifications();
    return { type: 'message', content: message, messageType: 'info' };
  },
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable all notifications',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext): SlashCommandActionReturn => {
    if (!context.services.settings) {
      return {
        type: 'message',
        content:
          'Cannot disable notifications: Settings service is not available.',
        messageType: 'error',
      };
    }
    setGlobalNotificationsEnabled(false, context.services.settings);
    return {
      type: 'message',
      content: 'All audio notifications have been disabled.',
      messageType: 'info',
    };
  },
};

const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show current notification configuration',
  kind: CommandKind.BUILT_IN,
  action: (): SlashCommandActionReturn => {
    const settings = getNotificationSettings();

    let statusMessage = 'Current Notification Settings:\n';
    statusMessage += `  Global Enabled: ${settings.enabled}\n`;
    statusMessage += '  Event Triggers:\n';
    (Object.keys(settings.events) as NotificationEventType[]).forEach(
      (eventType) => {
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
      },
    );

    return { type: 'message', content: statusMessage, messageType: 'info' };
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
      return {
        type: 'message',
        content:
          'Please provide a subcommand for /notifications: setup, test, disable, or status.',
        messageType: 'info',
      };
    }
    return {
      type: 'message',
      content:
        'Unknown subcommand for /notifications. Use setup, test, disable, or status.',
      messageType: 'error',
    };
  },
};
