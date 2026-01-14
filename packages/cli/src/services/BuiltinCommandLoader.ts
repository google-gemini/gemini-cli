/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDevelopment } from '../utils/installationInfo.js';
import type { ICommandLoader } from './types.js';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
} from '../ui/commands/types.js';
import type { MessageActionReturn, Config } from '@google/gemini-cli-core';
import { isNightly, startupProfiler } from '@google/gemini-cli-core';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { agentsCommand } from '../ui/commands/agentsCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { chatCommand, debugCommand } from '../ui/commands/chatCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
import { corgiCommand } from '../ui/commands/corgiCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { directoryCommand } from '../ui/commands/directoryCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { hooksCommand } from '../ui/commands/hooksCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { initCommand } from '../ui/commands/initCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';
import { permissionsCommand } from '../ui/commands/permissionsCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { policiesCommand } from '../ui/commands/policiesCommand.js';
import { profileCommand } from '../ui/commands/profileCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';
import { resumeCommand } from '../ui/commands/resumeCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { skillsCommand } from '../ui/commands/skillsCommand.js';
import { settingsCommand } from '../ui/commands/settingsCommand.js';
import { vimCommand } from '../ui/commands/vimCommand.js';
import { setupGithubCommand } from '../ui/commands/setupGithubCommand.js';
import { terminalSetupCommand } from '../ui/commands/terminalSetupCommand.js';

/**
 * Loads the core, hard-coded slash commands that are an integral part
 * of the Gemini CLI application.
 */
export class BuiltinCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Gathers all raw built-in command definitions, injects dependencies where
   * needed (e.g., config) and filters out any that are not available.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    const handle = startupProfiler.start('load_builtin_commands');

    const isNightlyBuild = await isNightly(process.cwd());

    const allDefinitions: Array<SlashCommand | null> = [
      aboutCommand,
      ...(this.config?.isAgentsEnabled() ? [agentsCommand] : []),
      authCommand,
      bugCommand,
      {
        ...chatCommand,
        subCommands: isNightlyBuild
          ? [...(chatCommand.subCommands || []), debugCommand]
          : chatCommand.subCommands,
      },
      clearCommand,
      compressCommand,
      copyCommand,
      corgiCommand,
      docsCommand,
      directoryCommand,
      editorCommand,
      ...(this.config?.getExtensionsEnabled() === false
        ? [
            {
              name: 'extensions',
              description: 'Manage extensions',
              kind: CommandKind.BUILT_IN,
              autoExecute: false,
              subCommands: [],
              action: async (
                _context: CommandContext,
              ): Promise<MessageActionReturn> => ({
                type: 'message',
                messageType: 'error',
                content: 'Extensions are disabled by your admin.',
              }),
            },
          ]
        : [extensionsCommand(this.config?.getEnableExtensionReloading())]),
      helpCommand,
      ...(this.config?.getEnableHooksUI() ? [hooksCommand] : []),
      await ideCommand(),
      initCommand,
      ...(this.config?.getMcpEnabled() === false
        ? [
            {
              name: 'mcp',
              description:
                'Manage configured Model Context Protocol (MCP) servers',
              kind: CommandKind.BUILT_IN,
              autoExecute: false,
              subCommands: [],
              action: async (
                _context: CommandContext,
              ): Promise<MessageActionReturn> => ({
                type: 'message',
                messageType: 'error',
                content: 'MCP is disabled by your admin.',
              }),
            },
          ]
        : [mcpCommand]),
      memoryCommand,
      modelCommand,
      ...(this.config?.getFolderTrust() ? [permissionsCommand] : []),
      privacyCommand,
      policiesCommand,
      ...(isDevelopment ? [profileCommand] : []),
      quitCommand,
      restoreCommand(this.config),
      resumeCommand,
      statsCommand,
      themeCommand,
      toolsCommand,
      ...(this.config?.isSkillsSupportEnabled()
        ? this.config?.getSkillManager()?.isAdminEnabled() === false
          ? [
              {
                name: 'skills',
                description: 'Manage agent skills',
                kind: CommandKind.BUILT_IN,
                autoExecute: false,
                subCommands: [],
                action: async (
                  _context: CommandContext,
                ): Promise<MessageActionReturn> => ({
                  type: 'message',
                  messageType: 'error',
                  content: 'Agent skills are disabled by your admin.',
                }),
              },
            ]
          : [skillsCommand]
        : []),
      settingsCommand,
      vimCommand,
      setupGithubCommand,
      terminalSetupCommand,
    ];
    handle?.end();
    return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
  }
}
