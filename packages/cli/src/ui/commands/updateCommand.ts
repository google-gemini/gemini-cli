/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { SettingScope } from '../../config/settings.js';
import { MessageType } from '../types.js';
import { checkForUpdates } from '../utils/updateCheck.js';

const updateEnableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable automatic updates and notifications',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    context.services.settings.setValue(
      SettingScope.User,
      'general.enableAutoUpdate',
      true,
    );
    context.services.settings.setValue(
      SettingScope.User,
      'general.enableAutoUpdateNotification',
      true,
    );
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Automatic updates and notifications enabled.',
    });
  },
};

const updateDisableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable automatic updates and notifications',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    context.services.settings.setValue(
      SettingScope.User,
      'general.enableAutoUpdate',
      false,
    );
    context.services.settings.setValue(
      SettingScope.User,
      'general.enableAutoUpdateNotification',
      false,
    );
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Automatic updates and notifications disabled. Your custom build will not be overwritten.',
    });
  },
};

const updateCheckCommand: SlashCommand = {
  name: 'check',
  description: 'Manually check for updates',
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    context.ui.addItem({
      type: MessageType.INFO,
      text: 'Checking for updates...',
    });
    const update = await checkForUpdates(context.services.settings);
    if (update) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: update.message,
      });
    } else {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'No updates available or update checks are disabled.',
      });
    }
  },
};

const updateStatusCommand: SlashCommand = {
  name: 'status',
  description: 'Show current update settings',
  kind: CommandKind.BUILT_IN,
  action: (context) => {
    const enabled = context.services.settings.merged.general.enableAutoUpdate;
    const notify =
      context.services.settings.merged.general.enableAutoUpdateNotification;
    context.ui.addItem({
      type: MessageType.INFO,
      text: `Update Settings:\n  Auto Update: ${enabled ? 'Enabled' : 'Disabled'}\n  Notifications: ${notify ? 'Enabled' : 'Disabled'}`,
    });
  },
};

export const updateCommand: SlashCommand = {
  name: 'update',
  description: 'Manage automatic updates',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    updateEnableCommand,
    updateDisableCommand,
    updateCheckCommand,
    updateStatusCommand,
  ],
  action: (context, args) => updateStatusCommand.action!(context, args),
};
