/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { MessageType } from '../types.js';

function setMode(context: CommandContext, enabled: boolean): void {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Debug companion mode is unavailable: config is not initialized.',
    });
    return;
  }

  config.setDebugCompanionMode(enabled);
  context.ui.setDebugMessage(
    enabled ? 'Debug companion mode enabled' : 'Debug companion mode disabled',
  );

  context.ui.addItem({
    type: MessageType.INFO,
    text: enabled
      ? 'Debug companion mode enabled. Keep using natural language prompts; active debug sessions and tool state are preserved across turns.'
      : 'Debug companion mode disabled.',
  });
}

function showStatus(context: CommandContext): void {
  const config = context.services.config;
  if (!config) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Debug companion mode is unavailable: config is not initialized.',
    });
    return;
  }

  const toolRegistry = config.getToolRegistry();
  const requiredTools = [
    'debug_attach',
    'debug_launch',
    'debug_set_breakpoint',
    'debug_stacktrace',
    'debug_variables',
    'debug_evaluate',
    'debug_step',
    'debug_continue',
    'debug_disconnect',
  ];
  const availableTools = requiredTools.filter((tool) =>
    toolRegistry.getTool(tool),
  );

  context.ui.addItem({
    type: MessageType.INFO,
    text: `Debug companion mode: ${config.getDebugCompanionMode() ? 'enabled' : 'disabled'}\nAvailable debug tools: ${availableTools.length}/${requiredTools.length}`,
  });
}

const onSubCommand: SlashCommand = {
  name: 'on',
  description: 'Enable persistent debug companion mode for this session.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    setMode(context, true);
  },
};

const offSubCommand: SlashCommand = {
  name: 'off',
  description: 'Disable persistent debug companion mode for this session.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    setMode(context, false);
  },
};

const statusSubCommand: SlashCommand = {
  name: 'status',
  description:
    'Show whether debug companion mode is enabled and tool readiness.',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    showStatus(context);
  },
};

export const debugCompanionCommand: SlashCommand = {
  name: 'debug',
  description:
    'Manage persistent debug companion mode. Usage: /debug [on|off|status]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [onSubCommand, offSubCommand, statusSubCommand],
  action: async (context: CommandContext, args: string): Promise<void> => {
    const subcommand = args.trim();

    if (!subcommand || subcommand === 'status') {
      showStatus(context);
      return;
    }

    if (subcommand === 'on') {
      setMode(context, true);
      return;
    }

    if (subcommand === 'off') {
      setMode(context, false);
      return;
    }

    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Unknown /debug subcommand. Use /debug on, /debug off, or /debug status.',
    });
  },
};
