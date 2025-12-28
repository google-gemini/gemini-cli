/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
} from './types.js';
import { CommandKind } from './types.js';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { AllowWizard } from '../components/AllowWizard.js';

const listAction = async (context: CommandContext): Promise<void> => {
  const settings = loadSettings(process.cwd());
  const allowed = settings.merged.tools?.allowed || [];

  if (allowed.length === 0) {
    context.ui.addItem(
      { type: 'info', text: 'No allowed tools configured.' },
      Date.now(),
    );
    return;
  }

  const text =
    'Allowed tools:\n' + allowed.map((tool) => `- ${tool}`).join('\n');
  context.ui.addItem({ type: 'info', text }, Date.now());
};

const addAction = async (
  context: CommandContext,
  args: string,
): Promise<SlashCommandActionReturn> => {
  // Parse arguments to find scope flag
  const argsList = args.trim().split(/\s+/).filter(Boolean);

  // Normalize --scope=value to --scope value
  for (let i = 0; i < argsList.length; i++) {
    if (argsList[i].startsWith('--scope=')) {
      const [flag, value] = argsList[i].split('=');
      argsList.splice(i, 1, flag, value);
    }
  }

  let scope = SettingScope.Workspace;
  const toolArgs: string[] = [];

  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i];
    if (arg === '-s' || arg === '--scope') {
      const value = argsList[i + 1]?.toLowerCase();
      switch (value) {
        case 'user':
          scope = SettingScope.User;
          i++;
          break;
        case 'project':
        case 'workspace':
          scope = SettingScope.Workspace;
          i++;
          break;
        default:
          // If the next token isn't a valid scope, we treat it as part of the tool name
          // and keep the default scope.
          break;
      }
    } else {
      toolArgs.push(arg);
    }
  }

  const tool = toolArgs.join(' ').trim();

  // If no tool provided, show the interactive wizard
  if (!tool) {
    return {
      type: 'custom_dialog',
      component: (
        <AllowWizard
          context={context}
          scope={scope}
          onClose={() => context.ui.removeComponent()}
        />
      ),
    };
  }

  const settings = loadSettings(process.cwd());
  // Use the scope determined from flags, defaulting to Workspace
  const existingSettings = settings.forScope(scope).settings;
  const tools = existingSettings.tools || {};
  const allowed = tools.allowed || [];

  if (allowed.includes(tool)) {
    return {
      type: 'message',
      messageType: 'info',
      content: `Tool "${tool}" is already allowed.`,
    };
  }

  const newAllowed = [...allowed, tool];
  settings.setValue(scope, 'tools.allowed', newAllowed);

  // Update in-memory config for immediate effect
  if (context.services.config) {
    const reloadedSettings = loadSettings(process.cwd());
    const mergedAllowed = reloadedSettings.merged.tools?.allowed || [];
    await context.services.config.setAllowedTools(mergedAllowed);
  }

  return {
    type: 'message',
    messageType: 'info',
    content: `Tool "${tool}" added to allowed list (${scope === SettingScope.User ? 'User' : 'Workspace'} scope).`,
  };
};

const removeAction = async (
  context: CommandContext,
  args: string,
): Promise<SlashCommandActionReturn> => {
  // Parse arguments to find scope flag
  const argsList = args.trim().split(/\s+/).filter(Boolean);

  // Normalize --scope=value to --scope value
  for (let i = 0; i < argsList.length; i++) {
    if (argsList[i].startsWith('--scope=')) {
      const [flag, value] = argsList[i].split('=');
      argsList.splice(i, 1, flag, value);
    }
  }

  let scope = SettingScope.Workspace;
  const toolArgs: string[] = [];

  for (let i = 0; i < argsList.length; i++) {
    const arg = argsList[i];
    if (arg === '-s' || arg === '--scope') {
      const value = argsList[i + 1]?.toLowerCase();
      switch (value) {
        case 'user':
          scope = SettingScope.User;
          i++;
          break;
        case 'project':
        case 'workspace':
          scope = SettingScope.Workspace;
          i++;
          break;
        default:
          break;
      }
    } else {
      toolArgs.push(arg);
    }
  }

  const tool = toolArgs.join(' ').trim();

  if (!tool) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Please specify a tool pattern to remove.',
    };
  }

  const settings = loadSettings(process.cwd());
  const existingSettings = settings.forScope(scope).settings;
  const tools = existingSettings.tools || {};
  const allowed = tools.allowed || [];

  if (!allowed.includes(tool)) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Tool "${tool}" not found in allowed list (${scope === SettingScope.User ? 'User' : 'Workspace'} scope).`,
    };
  }

  const newAllowed = allowed.filter((t) => t !== tool);
  settings.setValue(scope, 'tools.allowed', newAllowed);

  // Update in-memory config for immediate effect
  if (context.services.config) {
    const reloadedSettings = loadSettings(process.cwd());
    const mergedAllowed = reloadedSettings.merged.tools?.allowed || [];
    await context.services.config.setAllowedTools(mergedAllowed);
  }

  return {
    type: 'message',
    messageType: 'info',
    content: `Tool "${tool}" removed from allowed list.`,
  };
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List all allowed tools',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    await listAction(context);
  },
};

const addCommand: SlashCommand = {
  name: 'add',
  description: 'Add a tool to the allowed list',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: addAction,
  completion: (context: CommandContext, partialArg: string) => {
    const suggestions = [
      'run_shell_command(',
      'read_file',
      'replace',
      'grep',
      'list_directory',
      'glob',
      '-s user',
      '-s project',
    ];

    // If they already started typing run_shell_command, give some examples
    if (partialArg.startsWith('run_shell_command')) {
      suggestions.push(
        'run_shell_command(git)',
        'run_shell_command(ls)',
        'run_shell_command(npm)',
      );
    }

    return suggestions.filter((s) => s.startsWith(partialArg));
  },
};

const removeCommand: SlashCommand = {
  name: 'remove',
  description: 'Remove a tool from the allowed list',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: removeAction,
  completion: async (context: CommandContext, partialArg: string) => {
    const allowed = context.services.config?.getAllowedTools() || [];
    return allowed.filter((t) => t.startsWith(partialArg));
  },
};

export const allowCommand: SlashCommand = {
  name: 'allow',
  description: 'Manage allowed tools (whitelist)',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [listCommand, addCommand, removeCommand],
  action: async (context) => {
    await listAction(context);
  },
};
