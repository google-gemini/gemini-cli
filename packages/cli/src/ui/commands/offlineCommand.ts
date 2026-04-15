/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SettingScope } from '../../config/settings.js';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
} from './types.js';

function getStatusMessage(context: CommandContext): string {
  const config = context.services.agentContext?.config;
  if (!config) {
    return 'Offline mode status is unavailable because config is not loaded.';
  }

  const status = config.isOfflineModeEnabled() ? 'enabled' : 'disabled';
  const offlineSettings = config.getOfflineSettings();

  return `Offline mode is ${status}. Local routing: ${offlineSettings.localModelRouting}. Cloud delegation subagent: cloud-subagent (tool: cloud_subagent).`;
}

async function setOfflineMode(
  context: CommandContext,
  enabled: boolean,
): Promise<string> {
  const config = context.services.agentContext?.config;
  if (!config) {
    return 'Offline mode could not be changed because config is not loaded.';
  }

  context.services.settings.setValue(
    SettingScope.User,
    'general.offline.enabled',
    enabled,
  );
  await config.setOfflineMode(enabled);

  const status = enabled ? 'enabled' : 'disabled';
  return `Offline mode ${status}.`;
}

const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show current offline mode status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => ({
    type: 'message',
    messageType: 'info',
    content: getStatusMessage(context),
  }),
};

const enableCommand: SlashCommand = {
  name: 'on',
  altNames: ['enable'],
  description: 'Enable offline mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => ({
    type: 'message',
    messageType: 'info',
    content: await setOfflineMode(context, true),
  }),
};

const disableCommand: SlashCommand = {
  name: 'off',
  altNames: ['disable'],
  description: 'Disable offline mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => ({
    type: 'message',
    messageType: 'info',
    content: await setOfflineMode(context, false),
  }),
};

export const offlineCommand: SlashCommand = {
  name: 'offline',
  description: 'Manage offline mode and cloud delegation behavior',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  subCommands: [statusCommand, enableCommand, disableCommand],
  action: async (context) => ({
    type: 'message',
    messageType: 'info',
    content: getStatusMessage(context),
  }),
};
