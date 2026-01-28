/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, CommandContext } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';
import { MessageType, type HistoryItemHooksList } from '../types.js';
import type {
  HookRegistryEntry,
  MessageActionReturn,
} from '@google/gemini-cli-core';
import { getErrorMessage } from '@google/gemini-cli-core';
import { SettingScope, isLoadableSettingScope } from '../../config/settings.js';
import { enableHook, disableHook } from '../../utils/hookSettings.js';
import { renderHookActionFeedback } from '../../utils/hookUtils.js';

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
      content: t('commands:hooks.responses.configNotLoaded'),
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
      content: t('commands:hooks.responses.configNotLoaded'),
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.systemNotEnabled'),
    };
  }

  const hookName = args.trim();
  if (!hookName) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.usageEnable'),
    };
  }

  const settings = context.services.settings;
  const result = enableHook(settings, hookName);

  if (result.status === 'success') {
    hookSystem.setHookEnabled(hookName, true);
  }

  const feedback = renderHookActionFeedback(
    result,
    (label, path) => `${label} (${path})`,
  );

  return {
    type: 'message',
    messageType: result.status === 'error' ? 'error' : 'info',
    content: feedback,
  };
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
      content: t('commands:hooks.responses.configNotLoaded'),
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.systemNotEnabled'),
    };
  }

  const hookName = args.trim();
  if (!hookName) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.usageDisable'),
    };
  }

  const settings = context.services.settings;
  const scope = settings.workspace ? SettingScope.Workspace : SettingScope.User;

  const result = disableHook(settings, hookName, scope);

  if (result.status === 'success') {
    hookSystem.setHookEnabled(hookName, false);
  }

  const feedback = renderHookActionFeedback(
    result,
    (label, path) => `${label} (${path})`,
  );

  return {
    type: 'message',
    messageType: result.status === 'error' ? 'error' : 'info',
    content: feedback,
  };
}

/**
 * Completion function for enabled hook names (to be disabled)
 */
function completeEnabledHookNames(
  context: CommandContext,
  partialArg: string,
): string[] {
  const { config } = context.services;
  if (!config) return [];

  const hookSystem = config.getHookSystem();
  if (!hookSystem) return [];

  const allHooks = hookSystem.getAllHooks();
  return allHooks
    .filter((hook) => hook.enabled)
    .map((hook) => getHookDisplayName(hook))
    .filter((name) => name.startsWith(partialArg));
}

/**
 * Completion function for disabled hook names (to be enabled)
 */
function completeDisabledHookNames(
  context: CommandContext,
  partialArg: string,
): string[] {
  const { config } = context.services;
  if (!config) return [];

  const hookSystem = config.getHookSystem();
  if (!hookSystem) return [];

  const allHooks = hookSystem.getAllHooks();
  return allHooks
    .filter((hook) => !hook.enabled)
    .map((hook) => getHookDisplayName(hook))
    .filter((name) => name.startsWith(partialArg));
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
      content: t('commands:hooks.responses.configNotLoaded'),
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.systemNotEnabled'),
    };
  }

  const settings = context.services.settings;
  const allHooks = hookSystem.getAllHooks();

  if (allHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.noHooks'),
    };
  }

  const disabledHooks = allHooks.filter((hook) => !hook.enabled);
  if (disabledHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.allEnabled'),
    };
  }

  try {
    const scopes = [SettingScope.Workspace, SettingScope.User];
    for (const scope of scopes) {
      if (isLoadableSettingScope(scope)) {
        settings.setValue(scope, 'hooksConfig.disabled', []);
      }
    }

    for (const hook of disabledHooks) {
      const hookName = getHookDisplayName(hook);
      hookSystem.setHookEnabled(hookName, true);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.enableAllSuccess', {
        count: disabledHooks.length,
      }),
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.enableAllFailed', {
        error: getErrorMessage(error),
      }),
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
      content: t('commands:hooks.responses.configNotLoaded'),
    };
  }

  const hookSystem = config.getHookSystem();
  if (!hookSystem) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.systemNotEnabled'),
    };
  }

  const settings = context.services.settings;
  const allHooks = hookSystem.getAllHooks();

  if (allHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.noHooks'),
    };
  }

  const enabledHooks = allHooks.filter((hook) => hook.enabled);
  if (enabledHooks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.allDisabled'),
    };
  }

  try {
    const allHookNames = allHooks.map((hook) => getHookDisplayName(hook));
    const scope = settings.workspace
      ? SettingScope.Workspace
      : SettingScope.User;
    settings.setValue(scope, 'hooksConfig.disabled', allHookNames);

    for (const hook of enabledHooks) {
      const hookName = getHookDisplayName(hook);
      hookSystem.setHookEnabled(hookName, false);
    }

    return {
      type: 'message',
      messageType: 'info',
      content: t('commands:hooks.responses.disableAllSuccess', {
        count: enabledHooks.length,
      }),
    };
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('commands:hooks.responses.disableAllFailed', {
        error: getErrorMessage(error),
      }),
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
  completion: completeDisabledHookNames,
};

const disableCommand: SlashCommand = {
  name: 'disable',
  description: 'Disable a hook by name',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: disableAction,
  completion: completeEnabledHookNames,
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
