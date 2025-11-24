/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, MessageActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { NotificationManager } from '../../notifications/manager.js';
import { SettingScope } from '../../config/settings.js';

const enableSubcommand: SlashCommand = {
  name: 'enable',
  description: 'Enable all notifications',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const settings = context.services.settings;

    // Enable notifications
    settings.setValue(SettingScope.User, 'general.notifications.enabled', true);

    // Set default event configurations if not already set
    const notifications = (
      settings.merged as {
        general?: {
          notifications?: {
            enabled?: boolean;
            events?: {
              inputRequired?: { enabled?: boolean };
              taskComplete?: { enabled?: boolean };
              idleAlert?: { enabled?: boolean };
            };
          };
        };
      }
    ).general?.notifications;

    if (!notifications?.events?.inputRequired) {
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.inputRequired.enabled',
        true,
      );
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.inputRequired.sound',
        'system',
      );
    }

    if (!notifications?.events?.taskComplete) {
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.taskComplete.enabled',
        true,
      );
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.taskComplete.sound',
        'system',
      );
    }

    if (!notifications?.events?.idleAlert) {
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.idleAlert.enabled',
        true,
      );
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.idleAlert.timeout',
        60,
      );
      settings.setValue(
        SettingScope.User,
        'general.notifications.events.idleAlert.sound',
        'system',
      );
    }

    // Test the notification
    const manager = new NotificationManager(settings);
    await manager.notify('inputRequired');
    manager.dispose();

    return {
      type: 'message',
      messageType: 'info',
      content:
        'Notifications enabled! You should have heard a sound. Use `/notifications setup` to customize settings or `/notifications status` to view current configuration.',
    } as MessageActionReturn;
  },
};

const setupSubcommand: SlashCommand = {
  name: 'setup',
  description: 'Interactive wizard for notification preferences',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const settings = context.services.settings;
    const step = args.trim().toLowerCase();

    // If no step specified, start the wizard
    if (!step) {
      const notifications = (
        settings.merged as {
          general?: {
            notifications?: {
              enabled?: boolean;
              events?: {
                inputRequired?: {
                  enabled?: boolean;
                  sound?: string;
                  customPath?: string;
                };
                taskComplete?: {
                  enabled?: boolean;
                  sound?: string;
                  customPath?: string;
                };
                idleAlert?: {
                  enabled?: boolean;
                  sound?: string;
                  customPath?: string;
                  timeout?: number;
                };
              };
            };
          };
        }
      ).general?.notifications;

      const currentEnabled = notifications?.enabled ?? false;
      const currentInputRequired =
        notifications?.events?.inputRequired?.enabled ?? true;
      const currentTaskComplete =
        notifications?.events?.taskComplete?.enabled ?? true;
      const currentIdleAlert =
        notifications?.events?.idleAlert?.enabled ?? true;
      const currentIdleTimeout =
        notifications?.events?.idleAlert?.timeout ?? 60;

      const enableDisableStep = currentEnabled
        ? `Step 1: Disable Notifications
  Run: /notifications setup disable   (to disable)`
        : `Step 1: Enable Notifications
  Run: /notifications setup enable    (to enable)`;

      const message = `🔔 Notification Setup Wizard

Current settings:
  ✓ Notifications: ${currentEnabled ? 'ENABLED' : 'DISABLED'}
  ✓ Input Required: ${currentInputRequired ? 'ON' : 'OFF'}
  ✓ Task Complete: ${currentTaskComplete ? 'ON' : 'OFF'}
  ✓ Idle Alert: ${currentIdleAlert ? 'ON' : 'OFF'} (${currentIdleTimeout}s)

${enableDisableStep}

Step 2: Configure Input Required Notification
  Run: /notifications setup input on          (enable)
  Run: /notifications setup input off         (disable)
  Run: /notifications setup input custom <path>  (use custom sound)

Step 3: Configure Task Complete Notification
  Run: /notifications setup complete on       (enable)
  Run: /notifications setup complete off      (disable)
  Run: /notifications setup complete custom <path>  (use custom sound)

Step 4: Configure Idle Alert
  Run: /notifications setup idle on <seconds>     (enable with timeout)
  Run: /notifications setup idle off              (disable)
  Run: /notifications setup idle custom <path>    (use custom sound)

Examples:
  ${currentEnabled ? '/notifications setup disable' : '/notifications setup enable'}
  /notifications setup input on
  /notifications setup complete off
  /notifications setup idle on 120

After configuration, use /notifications test to test your settings.`;

      return {
        type: 'message',
        messageType: 'info',
        content: message,
      } as MessageActionReturn;
    }

    // Parse wizard steps
    const parts = step.split(/\s+/);
    const action = parts[0];
    const value = parts[1];
    const customPath = parts.slice(1).join(' ');

    // Step 1: Enable/Disable
    if (action === 'enable') {
      settings.setValue(
        SettingScope.User,
        'general.notifications.enabled',
        true,
      );
      return {
        type: 'message',
        messageType: 'info',
        content:
          '✓ Notifications enabled! Continue with: /notifications setup input on',
      } as MessageActionReturn;
    }

    if (action === 'disable') {
      settings.setValue(
        SettingScope.User,
        'general.notifications.enabled',
        false,
      );
      return {
        type: 'message',
        messageType: 'info',
        content: '✓ Notifications disabled.',
      } as MessageActionReturn;
    }

    // Step 2: Input Required
    if (action === 'input') {
      if (value === 'on') {
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.sound',
          'system',
        );
        return {
          type: 'message',
          messageType: 'info',
          content:
            '✓ Input Required notification enabled. Continue with: /notifications setup complete on',
        } as MessageActionReturn;
      }
      if (value === 'off') {
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.enabled',
          false,
        );
        return {
          type: 'message',
          messageType: 'info',
          content:
            '✓ Input Required notification disabled. Continue with: /notifications setup complete on',
        } as MessageActionReturn;
      }
      if (value === 'custom' && customPath && customPath !== 'custom') {
        const path = customPath.replace(/^custom\s+/, '');
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.sound',
          'custom',
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.inputRequired.customPath',
          path,
        );
        return {
          type: 'message',
          messageType: 'info',
          content: `✓ Input Required notification configured with custom sound: ${path}`,
        } as MessageActionReturn;
      }
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Invalid input. Use: /notifications setup input on|off|custom <path>',
      } as MessageActionReturn;
    }

    // Step 3: Task Complete
    if (action === 'complete') {
      if (value === 'on') {
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.sound',
          'system',
        );
        return {
          type: 'message',
          messageType: 'info',
          content:
            '✓ Task Complete notification enabled. Continue with: /notifications setup idle on 60',
        } as MessageActionReturn;
      }
      if (value === 'off') {
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.enabled',
          false,
        );
        return {
          type: 'message',
          messageType: 'info',
          content:
            '✓ Task Complete notification disabled. Continue with: /notifications setup idle on 60',
        } as MessageActionReturn;
      }
      if (value === 'custom' && customPath && customPath !== 'custom') {
        const path = customPath.replace(/^custom\s+/, '');
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.sound',
          'custom',
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.taskComplete.customPath',
          path,
        );
        return {
          type: 'message',
          messageType: 'info',
          content: `✓ Task Complete notification configured with custom sound: ${path}`,
        } as MessageActionReturn;
      }
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Invalid input. Use: /notifications setup complete on|off|custom <path>',
      } as MessageActionReturn;
    }

    // Step 4: Idle Alert
    if (action === 'idle') {
      if (value === 'on') {
        const timeout = parseInt(parts[2] || '60', 10);
        if (isNaN(timeout) || timeout < 1) {
          return {
            type: 'message',
            messageType: 'error',
            content:
              'Invalid timeout. Use: /notifications setup idle on <seconds>',
          } as MessageActionReturn;
        }
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.timeout',
          timeout,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.sound',
          'system',
        );
        return {
          type: 'message',
          messageType: 'info',
          content: `✓ Idle Alert configured (${timeout}s timeout). Setup complete! Use /notifications test to test your settings.`,
        } as MessageActionReturn;
      }
      if (value === 'off') {
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.enabled',
          false,
        );
        return {
          type: 'message',
          messageType: 'info',
          content:
            '✓ Idle Alert disabled. Setup complete! Use /notifications test to test your settings.',
        } as MessageActionReturn;
      }
      if (value === 'custom' && customPath && customPath !== 'custom') {
        const path = customPath.replace(/^custom\s+/, '');
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.enabled',
          true,
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.sound',
          'custom',
        );
        settings.setValue(
          SettingScope.User,
          'general.notifications.events.idleAlert.customPath',
          path,
        );
        const timeout = parseInt(parts[2] || '60', 10);
        if (!isNaN(timeout) && timeout >= 1) {
          settings.setValue(
            SettingScope.User,
            'general.notifications.events.idleAlert.timeout',
            timeout,
          );
        }
        return {
          type: 'message',
          messageType: 'info',
          content: `✓ Idle Alert configured with custom sound: ${path}. Setup complete! Use /notifications test to test your settings.`,
        } as MessageActionReturn;
      }
      return {
        type: 'message',
        messageType: 'error',
        content:
          'Invalid input. Use: /notifications setup idle on <seconds>|off|custom <path> [timeout]',
      } as MessageActionReturn;
    }

    return {
      type: 'message',
      messageType: 'error',
      content:
        'Unknown setup step. Run /notifications setup to see available options.',
    } as MessageActionReturn;
  },
};

const testSubcommand: SlashCommand = {
  name: 'test',
  description: 'Test current notification settings',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const manager = new NotificationManager(context.services.settings);
    const eventTypeArg = args.trim().toLowerCase();

    // Map argument to event type
    const eventTypeMap: Record<
      string,
      'inputRequired' | 'taskComplete' | 'idleAlert'
    > = {
      input: 'inputRequired',
      complete: 'taskComplete',
      idle: 'idleAlert',
    };

    // If no argument provided, show available options
    if (!eventTypeArg) {
      manager.dispose();
      return {
        type: 'message',
        messageType: 'info',
        content: `🔔 Test Notification Options

Available notification types to test:
  • input    - Test Input Required notification
  • complete - Test Task Complete notification
  • idle     - Test Idle Alert notification

Usage:
  /notifications test input
  /notifications test complete
  /notifications test idle`,
      } as MessageActionReturn;
    }

    // If specific event type provided, test only that one
    const eventType = eventTypeMap[eventTypeArg];
    if (!eventType) {
      manager.dispose();
      return {
        type: 'message',
        messageType: 'error',
        content: `Unknown notification type: ${eventTypeArg}. Use: input, complete, or idle`,
      } as MessageActionReturn;
    }

    // Check if notifications are enabled
    const notifications = (
      context.services.settings.merged as {
        general?: {
          notifications?: {
            enabled?: boolean;
            events?: {
              inputRequired?: { enabled?: boolean };
              taskComplete?: { enabled?: boolean };
              idleAlert?: { enabled?: boolean };
            };
          };
        };
      }
    ).general?.notifications;

    if (!notifications?.enabled) {
      manager.dispose();
      return {
        type: 'message',
        messageType: 'info',
        content:
          'Notifications are disabled. Use `/notifications enable` to enable them.',
      } as MessageActionReturn;
    }

    const eventConfig = notifications.events?.[eventType];
    if (!eventConfig?.enabled) {
      manager.dispose();
      return {
        type: 'message',
        messageType: 'info',
        content: `${eventTypeArg} notification is disabled. Use \`/notifications setup ${eventTypeArg} on\` to enable it.`,
      } as MessageActionReturn;
    }

    // Test the specific notification
    const result = await manager.notify(eventType);
    manager.dispose();

    const displayName =
      eventType === 'inputRequired'
        ? 'Input Required'
        : eventType === 'taskComplete'
          ? 'Task Complete'
          : 'Idle Alert';

    let content = `✓ Tested ${displayName} notification.`;
    if (result.fallbackUsed && result.fallbackReason) {
      content += `\n\n⚠️  ${result.fallbackReason}. Using default system sound instead.`;
    }

    return {
      type: 'message',
      messageType: 'info',
      content,
    } as MessageActionReturn;
  },
  completion: async (context, partialArg) => {
    const options = ['input', 'complete', 'idle'];
    return options.filter((option) =>
      option.startsWith(partialArg.toLowerCase()),
    );
  },
};

const disableSubcommand: SlashCommand = {
  name: 'disable',
  description: 'Disable all notifications',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const settings = context.services.settings;
    settings.setValue(
      SettingScope.User,
      'general.notifications.enabled',
      false,
    );

    return {
      type: 'message',
      messageType: 'info',
      content:
        'Notifications have been disabled. Use `/notifications enable` to re-enable them.',
    } as MessageActionReturn;
  },
};

const statusSubcommand: SlashCommand = {
  name: 'status',
  description: 'Show current notification configuration',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const settings = context.services.settings;
    const manager = new NotificationManager(settings);
    const status = manager.getStatus();

    manager.dispose();

    const formatEventStatus = (
      eventType: 'inputRequired' | 'taskComplete' | 'idleAlert',
    ): string => {
      const event = status.events[eventType];
      if (!event) {
        return `  ${eventType}: not configured`;
      }

      const soundInfo =
        event.sound === 'custom' && event.customPath
          ? `custom (${event.customPath})`
          : event.sound;
      const timeoutInfo =
        eventType === 'idleAlert' && event.timeout
          ? ` (timeout: ${event.timeout}s)`
          : '';

      return `  ${eventType}: ${event.enabled ? 'enabled' : 'disabled'} - ${soundInfo}${timeoutInfo}`;
    };

    const message = `Notification Status:
Enabled: ${status.enabled}
Events:
${formatEventStatus('inputRequired')}
${formatEventStatus('taskComplete')}
${formatEventStatus('idleAlert')}`;

    return {
      type: 'message',
      messageType: 'info',
      content: message,
    } as MessageActionReturn;
  },
};

export const notificationsCommand: SlashCommand = {
  name: 'notifications',
  description:
    'Configure audio notifications for user input and task completion',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    enableSubcommand,
    disableSubcommand,
    setupSubcommand,
    testSubcommand,
    statusSubcommand,
  ],
  action: async (context, args) => {
    // If no subcommand provided, show status
    if (!args || args.trim() === '') {
      return statusSubcommand.action!(context, '');
    }

    // Parse subcommand
    const parts = args.trim().split(/\s+/);
    const subcommandName = parts[0]?.toLowerCase();

    const subcommand = notificationsCommand.subCommands?.find(
      (cmd) => cmd.name === subcommandName,
    );

    if (subcommand && subcommand.action) {
      return subcommand.action(context, parts.slice(1).join(' '));
    }

    return {
      type: 'message',
      messageType: 'error',
      content: `Unknown subcommand: ${subcommandName}. Available subcommands: enable, setup, test, disable, status`,
    } as MessageActionReturn;
  },
};
