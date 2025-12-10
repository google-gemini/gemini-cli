/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { MessageType, type HistoryItemHooksList } from '../types.js';
import type {
  HookRegistryEntry,
  MessageActionReturn,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import { SettingScope } from '../../config/settings.js';

/**
 * Display a formatted list of hooks with their status
 */
async function panelAction(
  context: CommandContext,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'Hook system is not enabled. Enable it in settings with tools.enableHooks',
    };
  }

  const allHooks = hookSystem.getAllHooks();
  if (allHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content:
        'No hooks configured. Add hooks to your settings to get started.',
    };
  }

  const hooksListItem: HistoryItemHooksList = {
    type: MessageType.HOOKS_LIST,
    hooks: allHooks,
  };

  context.ui.addItem(hooksListItem, Date.now());
}

/**
 * Enable a hook by name
 */
async function enableAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Hook system is not enabled.',
    };
  }

  const hookName = args.trim();
  if (!hookName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /hooks enable <hook-name>',
    };
  }

  // Get current disabled hooks from settings
  const settings = context.services.settings;
  const disabledHooks = settings.merged.hooks?.disabled || ([] as string[]);

  // Remove from disabled list if present
  const newDisabledHooks = disabledHooks.filter(
    (name: string) => name !== hookName,
  );

  // Update settings (setValue automatically saves)
  try {
    settings.setValue(SettingScope.User, 'hooks.disabled', newDisabledHooks);

    // Enable in hook system
    hookSystem.setHookEnabled(hookName, true);

    return {
      type: 'message',
      messageType: 'info',
      content: `Hook "${hookName}" enabled successfully.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to enable hook: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Disable a hook by name
 */
async function disableAction(
  context: CommandContext,
  args: string,
): Promise<void | MessageActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Config not loaded.',
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Hook system is not enabled.',
    };
  }

  const hookName = args.trim();
  if (!hookName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /hooks disable <hook-name>',
    };
  }

  // Get current disabled hooks from settings
  const settings = context.services.settings;
  const disabledHooks = settings.merged.hooks?.disabled || ([] as string[]);

  // Add to disabled list if not already present
  if (!disabledHooks.includes(hookName)) {
    const newDisabledHooks = [...disabledHooks, hookName];

    // Update settings (setValue automatically saves)
    try {
      settings.setValue(SettingScope.User, 'hooks.disabled', newDisabledHooks);

      // Disable in hook system
      hookSystem.setHookEnabled(hookName, false);

      return {
        type: 'message',
        messageType: 'info',
        content: `Hook "${hookName}" disabled successfully.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to disable hook: ${getErrorMessage(error)}`,
      };
    }
  } else {
    return {
      type: 'message',
      messageType: 'info',
      content: `Hook "${hookName}" is already disabled.`,
    };
  }
}

/**
 * Completion function for hook names
 */
function completeHookNames(
  context: CommandContext,
  partialArg: string,
): string[] {
  const { config } = context.services;
  if (!config) return [];

  const hookSystem = config.getHookSystem();
  if (!hookSystem) return [];

  const allHooks = hookSystem.getAllHooks();
  const hookNames = allHooks.map((hook) => getHookDisplayName(hook));
  return hookNames.filter((name) => name.startsWith(partialArg));
}

/**
 * Get a display name for a hook
 */
function getHookDisplayName(hook: HookRegistryEntry): string {
  return hook.config.command || 'unknown-hook';
}

const panelCommand: SlashCommand = {
  name: 'panel',
  altNames: ['list', 'show'],
  description: 'Display all registered hooks with their status',
  kind: CommandKind.BUILT_IN,
  action: panelAction,
};

const enableCommand: SlashCommand = {
  name: 'enable',
  description: 'Enable a hook by name',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: enableAction,
  completion: completeHookNames,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable a hook by name',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: disableAction,
  completion: completeHookNames,
};

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'Manage hooks',
  kind: CommandKind.BUILT_IN,
  subCommands: [panelCommand, enableCommand, disableCommand],
  action: async (context: CommandContext) => panelCommand.action!(context, ''),
};
