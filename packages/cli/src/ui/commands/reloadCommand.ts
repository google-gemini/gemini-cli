/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { refreshMemory } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import {
  CommandKind,
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

/**
 * Action for the top-level `/reload` command.
 * Orchestrates re-syncing the agent by reloading skills, agents, MCP servers,
 * memory, and then refreshing the slash commands.
 */
async function reloadAllAction(
  context: CommandContext,
): Promise<void | SlashCommandActionReturn> {
  const agentContext = context.services.agentContext;
  const config = agentContext?.config;

  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not retrieve configuration for reload.',
    };
  }

  context.ui.addItem({
    type: MessageType.INFO,
    text: 'Reloading all agent systems...',
  });

  const errors: string[] = [];

  // 0. Reload settings.json
  try {
    context.services.settings.reload();
  } catch (error) {
    errors.push(
      `Settings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 1. Reload Skills & Extensions
  try {
    await config.reloadSkills();
  } catch (error) {
    errors.push(
      `Skills: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 2. Reload Agent Registry
  const agentRegistry = config.getAgentRegistry();
  if (agentRegistry) {
    try {
      await agentRegistry.reload();
    } catch (error) {
      errors.push(
        `Agents: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 3. Reload MCP Servers
  const mcpClientManager = config.getMcpClientManager();
  if (mcpClientManager) {
    try {
      await mcpClientManager.restart();
      // Update the client with the new tools
      if (agentContext.geminiClient?.isInitialized()) {
        await agentContext.geminiClient.setTools();
      }
    } catch (error) {
      errors.push(
        `MCP: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 4. Reload Memory
  try {
    const memoryResult = await refreshMemory(config);
    context.ui.addItem({
      type: MessageType.INFO,
      text: memoryResult.content,
    });
  } catch (error) {
    errors.push(
      `Memory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 5. Finally, reload slash commands to reflect all changes
  try {
    context.ui.reloadCommands();
  } catch (error) {
    errors.push(
      `Commands: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (errors.length > 0) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Reload completed with errors:\n- ${errors.join('\n- ')}`,
    };
  }

  return {
    type: 'message',
    messageType: 'info',
    content: 'All systems reloaded successfully.',
  };
}

export const reloadCommand: SlashCommand = {
  name: 'reload',
  altNames: ['refresh'],
  description:
    'Reload all agent systems (skills, agents, MCP, memory, and commands)',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: reloadAllAction,
};
