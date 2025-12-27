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
 * Enable a hook by name or all hooks from an extension using wildcard syntax
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

  const hookArg = args.trim();
  if (!hookArg) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Usage: /hooks enable <hook-name> or /hooks enable <extension>/*',
    };
  }

  const settings = context.services.settings;

  // Check for extension wildcard pattern: <extension>/*
  if (hookArg.endsWith('/*')) {
    const extensionName = hookArg.slice(0, -2);
    if (!extensionName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid syntax. Use: /hooks enable <extension>/*',
      };
    }

    try {
      // Get current disabled extensions from settings
      const disabledExtensions =
        settings.merged.hooks?.extensionHooksDisabled || ([] as string[]);

      // Remove from disabled list if present
      const newDisabledExtensions = disabledExtensions.filter(
        (name: string) => name !== extensionName,
      );

      // Update settings (setValue automatically saves)
      settings.setValue(
        SettingScope.User,
        'hooks.extensionHooksDisabled',
        newDisabledExtensions,
      );

      // Enable in hook system
      hookSystem.setExtensionHooksEnabled(extensionName, true);

      return {
        type: 'message',
        messageType: 'info',
        content: `All hooks from extension "${extensionName}" enabled successfully.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to enable extension hooks: ${getErrorMessage(error)}`,
      };
    }
  }

  // Single hook enable (existing logic)
  const hookName = hookArg;

  // Get current disabled hooks from settings
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
 * Disable a hook by name or all hooks from an extension using wildcard syntax
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

  const hookArg = args.trim();
  if (!hookArg) {
    return {
      type: 'message',
      messageType: 'error',
      content:
        'Usage: /hooks disable <hook-name> or /hooks disable <extension>/*',
    };
  }

  const settings = context.services.settings;

  // Check for extension wildcard pattern: <extension>/*
  if (hookArg.endsWith('/*')) {
    const extensionName = hookArg.slice(0, -2);
    if (!extensionName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Invalid syntax. Use: /hooks disable <extension>/*',
      };
    }

    try {
      // Get current disabled extensions from settings
      const disabledExtensions =
        settings.merged.hooks?.extensionHooksDisabled || ([] as string[]);

      // Add to disabled list if not already present
      if (!disabledExtensions.includes(extensionName)) {
        const newDisabledExtensions = [...disabledExtensions, extensionName];

        // Update settings (setValue automatically saves)
        settings.setValue(
          SettingScope.User,
          'hooks.extensionHooksDisabled',
          newDisabledExtensions,
        );

        // Disable in hook system
        hookSystem.setExtensionHooksEnabled(extensionName, false);

        return {
          type: 'message',
          messageType: 'info',
          content: `All hooks from extension "${extensionName}" disabled successfully.`,
        };
      } else {
        return {
          type: 'message',
          messageType: 'info',
          content: `All hooks from extension "${extensionName}" are already disabled.`,
        };
      }
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to disable extension hooks: ${getErrorMessage(error)}`,
      };
    }
  }

  // Single hook disable (existing logic)
  const hookName = hookArg;

  // Get current disabled hooks from settings
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
 * Completion function for hook names and extension wildcards
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

  // Get unique extension names for wildcard suggestions
  const extensionNames = new Set<string>();
  for (const hook of allHooks) {
    if (hook.extensionName) {
      extensionNames.add(hook.extensionName);
    }
  }

  // Add wildcard patterns for extensions
  const extensionWildcards = Array.from(extensionNames).map(
    (name) => `${name}/*`,
  );

  // Combine hook names and extension wildcards
  const allCompletions = [...hookNames, ...extensionWildcards];

  return allCompletions.filter((name) => name.startsWith(partialArg));
}

/**
 * Get a display name for a hook
 */
function getHookDisplayName(hook: HookRegistryEntry): string {
  return hook.config.name || hook.config.command || 'unknown-hook';
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
