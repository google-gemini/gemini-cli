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
  const allHooks = hookSystem?.getAllHooks() || [];

  const hooksListItem: HistoryItemHooksList = {
    type: MessageType.HOOKS_LIST,
    hooks: allHooks,
  };

  context.ui.addItem(hooksListItem);
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
  const disabledHooks = settings.merged.hooks.disabled;
  // Remove from disabled list if present
  const newDisabledHooks = disabledHooks.filter(
    (name: string) => name !== hookName,
  );

  // Update settings (setValue automatically saves)
  try {
    const scope = settings.workspace
      ? SettingScope.Workspace
      : SettingScope.User;
    settings.setValue(scope, 'hooks.disabled', newDisabledHooks);

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
  const disabledHooks = settings.merged.hooks.disabled;
  // Add to disabled list if not already present
  if (!disabledHooks.includes(hookName)) {
    const newDisabledHooks = [...disabledHooks, hookName];

    // Update settings (setValue automatically saves)
    try {
      const scope = settings.workspace
        ? SettingScope.Workspace
        : SettingScope.User;
      settings.setValue(scope, 'hooks.disabled', newDisabledHooks);

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
  return hook.config.name || hook.config.command || 'unknown-hook';
}

/**
 * Enable all hooks by clearing the disabled list
 */
async function enableAllAction(
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
      messageType: 'error',
      content: 'Hook system is not enabled.',
    };
  }

  const settings = context.services.settings;
  const allHooks = hookSystem.getAllHooks();

  if (allHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No hooks configured.',
    };
  }

  const disabledHooks = allHooks.filter((hook) => !hook.enabled);
  if (disabledHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'All hooks are already enabled.',
    };
  }

  try {
    const scope = settings.workspace
      ? SettingScope.Workspace
      : SettingScope.User;
    settings.setValue(scope, 'hooks.disabled', []);

    for (const hook of disabledHooks) {
      const hookName = getHookDisplayName(hook);
      hookSystem.setHookEnabled(hookName, true);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Enabled ${disabledHooks.length} hook(s) successfully.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to enable hooks: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Disable all hooks by adding all hooks to the disabled list
 */
async function disableAllAction(
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
      messageType: 'error',
      content: 'Hook system is not enabled.',
    };
  }

  const settings = context.services.settings;
  const allHooks = hookSystem.getAllHooks();

  if (allHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'No hooks configured.',
    };
  }

  const enabledHooks = allHooks.filter((hook) => hook.enabled);
  if (enabledHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: 'All hooks are already disabled.',
    };
  }

  try {
    const allHookNames = allHooks.map((hook) => getHookDisplayName(hook));
    const scope = settings.workspace
      ? SettingScope.Workspace
      : SettingScope.User;
    settings.setValue(scope, 'hooks.disabled', allHookNames);

    for (const hook of enabledHooks) {
      const hookName = getHookDisplayName(hook);
      hookSystem.setHookEnabled(hookName, false);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Disabled ${enabledHooks.length} hook(s) successfully.`,
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to disable hooks: ${getErrorMessage(error)}`,
    };
  }
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

const enableAllCommand: SlashCommand = {
  name: 'enable-all',
  altNames: ['enableall'],
  description: 'Enable all disabled hooks',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: enableAllAction,
};

const disableAllCommand: SlashCommand = {
  name: 'disable-all',
  altNames: ['disableall'],
  description: 'Disable all enabled hooks',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: disableAllAction,
};

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'Manage hooks',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    panelCommand,
    enableCommand,
    disableCommand,
    enableAllCommand,
    disableAllCommand,
  ],
  action: async (context: CommandContext) => panelCommand.action!(context, ''),
};
