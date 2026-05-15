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
import {
  isNightly,
  startupProfiler,
  getAdminErrorMessage,
  AuthType,
} from '@google/gemini-cli-core';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { agentsCommand } from '../ui/commands/agentsCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { bugCommand } from '../ui/commands/bugCommand.js';
import { bugMemoryCommand } from '../ui/commands/bugMemoryCommand.js';
import { chatCommand, debugCommand } from '../ui/commands/chatCommand.js';
import { clearCommand } from '../ui/commands/clearCommand.js';
import { commandsCommand } from '../ui/commands/commandsCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
import { corgiCommand } from '../ui/commands/corgiCommand.js';
import { docsCommand } from '../ui/commands/docsCommand.js';
import { exportSessionCommand } from '../ui/commands/exportSessionCommand.js';
import { directoryCommand } from '../ui/commands/directoryCommand.js';
import { editorCommand } from '../ui/commands/editorCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { footerCommand } from '../ui/commands/footerCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { shortcutsCommand } from '../ui/commands/shortcutsCommand.js';
import { rewindCommand } from '../ui/commands/rewindCommand.js';
import { hooksCommand } from '../ui/commands/hooksCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { initCommand } from '../ui/commands/initCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';
import { oncallCommand } from '../ui/commands/oncallCommand.js';
import { permissionsCommand } from '../ui/commands/permissionsCommand.js';
import { planCommand } from '../ui/commands/planCommand.js';
import { policiesCommand } from '../ui/commands/policiesCommand.js';
import { privacyCommand } from '../ui/commands/privacyCommand.js';
import { profileCommand } from '../ui/commands/profileCommand.js';
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';
import { resumeCommand } from '../ui/commands/resumeCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { skillsCommand } from '../ui/commands/skillsCommand.js';
import { settingsCommand } from '../ui/commands/settingsCommand.js';
import { tasksCommand } from '../ui/commands/tasksCommand.js';
import { vimCommand } from '../ui/commands/vimCommand.js';
import { setupGithubCommand } from '../ui/commands/setupGithubCommand.js';
import { terminalSetupCommand } from '../ui/commands/terminalSetupCommand.js';
import { upgradeCommand } from '../ui/commands/upgradeCommand.js';
import { gemmaStatusCommand } from '../ui/commands/gemmaStatusCommand.js';
import { voiceCommand } from '../ui/commands/voiceCommand.js';

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

    try {
      const isNightlyBuild = await isNightly(process.cwd());
      
      // Load IDE command in parallel but don't block the static commands.
      // We use a race with a short timeout to ensure we don't hang startup.
      const idePromise = ideCommand().catch(() => null);

      const addDebugToChatResumeSubCommands = (
        subCommands: SlashCommand[] | undefined,
      ): SlashCommand[] | undefined => {
        if (!subCommands) {
          return subCommands;
        }

        const withNestedCompatibility = subCommands.map((subCommand) => {
          if (subCommand.name !== 'checkpoints') {
            return subCommand;
          }

          return {
            ...subCommand,
            subCommands: addDebugToChatResumeSubCommands(subCommand.subCommands),
          };
        });

        if (!isNightlyBuild) {
          return withNestedCompatibility;
        }

        return withNestedCompatibility.some(
          (cmd) => cmd.name === debugCommand.name,
        )
          ? withNestedCompatibility
          : [
              ...withNestedCompatibility,
              { ...debugCommand, suggestionGroup: 'checkpoints' },
            ];
      };

      const ideCmd = await Promise.race([
        idePromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
      ]);

      const chatResumeSubCommands = addDebugToChatResumeSubCommands(
        chatCommand.subCommands,
      );

      const safeWrap = (
        cmdOrFn: SlashCommand | (() => SlashCommand) | null,
        _name: string,
      ): SlashCommand | null => {
        try {
          if (!cmdOrFn) return null;
          return typeof cmdOrFn === 'function' ? cmdOrFn() : cmdOrFn;
        } catch {
          // If a specific command fails to load, we still want the rest of the CLI to function.
          return null;
        }
      };

      const allDefinitions: Array<SlashCommand | null> = [
        safeWrap(aboutCommand, 'about'),
        ...(this.config?.isAgentsEnabled()
          ? [safeWrap(agentsCommand, 'agents')]
          : []),
        safeWrap(authCommand, 'auth'),
        safeWrap(bugCommand, 'bug'),
        safeWrap(bugMemoryCommand, 'bugMemory'),
        safeWrap(
          {
            ...chatCommand,
            subCommands: chatResumeSubCommands,
          },
          'chat',
        ),
        safeWrap(clearCommand, 'clear'),
        safeWrap(commandsCommand, 'commands'),
        safeWrap(compressCommand, 'compress'),
        safeWrap(copyCommand, 'copy'),
        safeWrap(corgiCommand, 'corgi'),
        safeWrap(docsCommand, 'docs'),
        safeWrap(exportSessionCommand, 'exportSession'),
        safeWrap(directoryCommand, 'directory'),
        safeWrap(editorCommand, 'editor'),
        ...(this.config?.getExtensionsEnabled() === false
          ? [
              safeWrap(
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
                    content: getAdminErrorMessage(
                      'Extensions',
                      this.config ?? undefined,
                    ),
                  }),
                },
                'extensions_disabled',
              ),
            ]
          : [
              safeWrap(
                () =>
                  extensionsCommand(this.config?.getEnableExtensionReloading()),
                'extensions',
              ),
            ]),
        safeWrap(helpCommand, 'help'),
        safeWrap(footerCommand, 'footer'),
        safeWrap(shortcutsCommand, 'shortcuts'),
        ...(this.config?.getEnableHooksUI()
          ? [safeWrap(hooksCommand, 'hooks')]
          : []),
        safeWrap(rewindCommand, 'rewind'),
        safeWrap(ideCmd, 'ide'),
        safeWrap(initCommand, 'init'),
        ...(isNightlyBuild ? [safeWrap(oncallCommand, 'oncall')] : []),
        ...(this.config?.getMcpEnabled() === false
          ? [
              safeWrap(
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
                    content: getAdminErrorMessage(
                      'MCP',
                      this.config ?? undefined,
                    ),
                  }),
                },
                'mcp_disabled',
              ),
            ]
          : [safeWrap(mcpCommand, 'mcp')]),
        safeWrap(() => memoryCommand(this.config), 'memory'),
        safeWrap(modelCommand, 'model'),
        ...(this.config?.getFolderTrust()
          ? [safeWrap(permissionsCommand, 'permissions')]
          : []),
        ...(this.config?.isPlanEnabled()
          ? [safeWrap(planCommand, 'plan')]
          : []),
        safeWrap(policiesCommand, 'policies'),
        safeWrap(privacyCommand, 'privacy'),
        ...(isDevelopment ? [safeWrap(profileCommand, 'profile')] : []),
        safeWrap(quitCommand, 'quit'),
        safeWrap(() => restoreCommand(this.config), 'restore'),
        safeWrap(
          {
            ...resumeCommand,
            subCommands: addDebugToChatResumeSubCommands(
              resumeCommand.subCommands,
            ),
          },
          'resume',
        ),
        safeWrap(statsCommand, 'stats'),
        safeWrap(themeCommand, 'theme'),
        safeWrap(toolsCommand, 'tools'),
        ...(this.config?.isSkillsSupportEnabled()
          ? this.config?.getSkillManager()?.isAdminEnabled() === false
            ? [
                safeWrap(
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
                      content: getAdminErrorMessage(
                        'Agent skills',
                        this.config ?? undefined,
                      ),
                    }),
                  },
                  'skills_disabled',
                ),
              ]
            : [safeWrap(skillsCommand, 'skills')]
          : []),
        safeWrap(settingsCommand, 'settings'),
        safeWrap(gemmaStatusCommand, 'gemmaStatus'),
        safeWrap(tasksCommand, 'tasks'),
        safeWrap(vimCommand, 'vim'),
        safeWrap(setupGithubCommand, 'setupGithub'),
        safeWrap(terminalSetupCommand, 'terminalSetup'),
        ...(this.config?.isVoiceModeEnabled()
          ? [safeWrap(voiceCommand, 'voice')]
          : []),
        ...(this.config?.getContentGeneratorConfig()?.authType ===
        AuthType.LOGIN_WITH_GOOGLE
          ? [safeWrap(upgradeCommand, 'upgrade')]
          : []),
      ];
      return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
    } finally {
      handle?.end();
    }
  }
}
