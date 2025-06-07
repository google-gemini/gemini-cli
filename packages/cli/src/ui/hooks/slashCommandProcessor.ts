/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo } from 'react';
import { type PartListUnion } from '@google/genai';
import open from 'open';
import process from 'node:process';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { Config, MCPServerStatus, getMCPServerStatus } from '@gemini-cli/core';
import { Message, MessageType, HistoryItemWithoutId } from '../types.js';
import { createShowMemoryAction } from './useShowMemoryCommand.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { formatMemoryUsage } from '../utils/formatters.js';
import { getCliVersion } from '../../utils/version.js';

export interface SlashCommandActionReturn {
  shouldScheduleTool?: boolean;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  message?: string; // For simple messages or errors
}

export interface SlashCommand {
  name: string;
  altName?: string;
  description?: string;
  action: (
    mainCommand: string,
    subCommand?: string,
    args?: string,
  ) => void | SlashCommandActionReturn; // Action can now return this object
}

/**
 * Hook to define and process slash commands (e.g., /help, /clear).
 */
export const useSlashCommandProcessor = (
  config: Config | null,
  addItem: UseHistoryManagerReturn['addItem'],
  clearItems: UseHistoryManagerReturn['clearItems'],
  refreshStatic: () => void,
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  onDebugMessage: (message: string) => void,
  openThemeDialog: () => void,
  performMemoryRefresh: () => Promise<void>,
  toggleCorgiMode: () => void,
) => {
  const addMessage = useCallback(
    (message: Message) => {
      // Convert Message to HistoryItemWithoutId
      let historyItemContent: HistoryItemWithoutId;
      if (message.type === MessageType.ABOUT) {
        historyItemContent = {
          type: 'about',
          cliVersion: message.cliVersion,
          osVersion: message.osVersion,
          sandboxEnv: message.sandboxEnv,
          modelVersion: message.modelVersion,
        };
      } else {
        historyItemContent = {
          type: message.type as
            | MessageType.INFO
            | MessageType.ERROR
            | MessageType.USER,
          text: message.content,
        };
      }
      addItem(historyItemContent, message.timestamp.getTime());
    },
    [addItem],
  );

  const showMemoryAction = useCallback(async () => {
    const actionFn = createShowMemoryAction(config, addMessage);
    await actionFn();
  }, [config, addMessage]);

  const addMemoryAction = useCallback(
    (
      _mainCommand: string,
      _subCommand?: string,
      args?: string,
    ): SlashCommandActionReturn | void => {
      if (!args || args.trim() === '') {
        addMessage({
          type: MessageType.ERROR,
          content: 'Usage: /memory add <text to remember>',
          timestamp: new Date(),
        });
        return;
      }
      // UI feedback for attempting to schedule
      addMessage({
        type: MessageType.INFO,
        content: `Attempting to save to memory: "${args.trim()}"`,
        timestamp: new Date(),
      });
      // Return info for scheduling the tool call
      return {
        shouldScheduleTool: true,
        toolName: 'save_memory',
        toolArgs: { fact: args.trim() },
      };
    },
    [addMessage],
  );

  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        name: 'help',
        altName: '?',
        description: 'for help on gemini-cli',
        action: (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Opening help.');
          setShowHelp(true);
        },
      },
      {
        name: 'clear',
        description: 'clear the screen',
        action: (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Clearing terminal.');
          clearItems();
          console.clear();
          refreshStatic();
        },
      },
      {
        name: 'theme',
        description: 'change the theme',
        action: (_mainCommand, _subCommand, _args) => {
          openThemeDialog();
        },
      },
      {
        name: 'mcp',
        description: 'list configured MCP servers and tools',
        action: async (_mainCommand, _subCommand, _args) => {
          const toolRegistry = await config?.getToolRegistry();
          if (!toolRegistry) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Could not retrieve tool registry.',
              timestamp: new Date(),
            });
            return;
          }

          const mcpServers = config?.getMcpServers() || {};
          const serverNames = Object.keys(mcpServers);

          if (serverNames.length === 0) {
            addMessage({
              type: MessageType.INFO,
              content: 'No MCP servers configured.',
              timestamp: new Date(),
            });
            return;
          }

          let message = 'Configured MCP servers and tools:\n\n';

          for (const serverName of serverNames) {
            const serverTools = toolRegistry.getToolsByServer(serverName);
            const status = getMCPServerStatus(serverName);

            // Add status indicator
            let statusDot = '';
            switch (status) {
              case MCPServerStatus.CONNECTED:
                statusDot = '🟢'; // Green dot for connected
                break;
              case MCPServerStatus.CONNECTING:
                statusDot = '🟡'; // Yellow dot for connecting
                break;
              case MCPServerStatus.DISCONNECTED:
              default:
                statusDot = '🔴'; // Red dot for disconnected
                break;
            }

            message += `${statusDot} ${serverName} (${serverTools.length} tools):\n`;
            if (serverTools.length > 0) {
              serverTools.forEach((tool) => {
                message += `  - ${tool.name}\n`;
              });
            } else {
              message += '  No tools available\n';
            }
            message += '\n';
          }

          addMessage({
            type: MessageType.INFO,
            content: message,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'memory',
        description:
          'manage memory. Usage: /memory <show|refresh|add> [text for add]',
        action: (mainCommand, subCommand, args) => {
          switch (subCommand) {
            case 'show':
              showMemoryAction();
              return; // Explicitly return void
            case 'refresh':
              performMemoryRefresh();
              return; // Explicitly return void
            case 'add':
              return addMemoryAction(mainCommand, subCommand, args); // Return the object
            default:
              addMessage({
                type: MessageType.ERROR,
                content: `Unknown /memory command: ${subCommand}. Available: show, refresh, add`,
                timestamp: new Date(),
              });
              return; // Explicitly return void
          }
        },
      },
      {
        name: 'tools',
        description: 'list available Gemini CLI tools',
        action: async (_mainCommand, _subCommand, _args) => {
          const toolRegistry = await config?.getToolRegistry();
          const tools = toolRegistry?.getAllTools();
          if (!tools) {
            addMessage({
              type: MessageType.ERROR,
              content: 'Could not retrieve tools.',
              timestamp: new Date(),
            });
            return;
          }

          // Filter out MCP tools by checking if they have a serverName property
          const geminiTools = tools.filter((tool) => !('serverName' in tool));
          const geminiToolList = geminiTools.map((tool) => tool.name);

          addMessage({
            type: MessageType.INFO,
            content: `Available Gemini CLI tools:\n\n${geminiToolList.join('\n')}`,
            timestamp: new Date(),
          });
        },
      },
      {
        name: 'corgi',
        action: (_mainCommand, _subCommand, _args) => {
          toggleCorgiMode();
        },
      },
      {
        name: 'about',
        description: 'show version info',
        action: (_mainCommand, _subCommand, _args) => {
          const osVersion = process.platform;
          let sandboxEnv = 'no sandbox';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX;
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${process.env.SEATBELT_PROFILE || 'unknown'})`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const cliVersion = getCliVersion();
          addMessage({
            type: MessageType.ABOUT,
            timestamp: new Date(),
            cliVersion,
            osVersion,
            sandboxEnv,
            modelVersion,
          });
        },
      },
      {
        name: 'bug',
        description: 'submit a bug report',
        action: (_mainCommand, _subCommand, args) => {
          let bugDescription = _subCommand || '';
          if (args) {
            bugDescription += ` ${args}`;
          }
          bugDescription = bugDescription.trim();

          const osVersion = `${process.platform} ${process.version}`;
          let sandboxEnv = 'no sandbox';
          if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
            sandboxEnv = process.env.SANDBOX.replace(/^gemini-(?:code-)?/, '');
          } else if (process.env.SANDBOX === 'sandbox-exec') {
            sandboxEnv = `sandbox-exec (${process.env.SEATBELT_PROFILE || 'unknown'})`;
          }
          const modelVersion = config?.getModel() || 'Unknown';
          const memoryUsage = formatMemoryUsage(process.memoryUsage().rss);
          const cliVersion = getCliVersion();

          const diagnosticInfo = `
## Describe the bug
A clear and concise description of what the bug is.

## Additional context
Add any other context about the problem here.

## Diagnostic Information
*   **CLI Version:** ${cliVersion}
*   **Git Commit:** ${GIT_COMMIT_INFO}
*   **Operating System:** ${osVersion}
*   **Sandbox Environment:** ${sandboxEnv}
*   **Model Version:** ${modelVersion}
*   **Memory Usage:** ${memoryUsage}
`;

          let bugReportUrl =
            'https://github.com/google-gemini/gemini-cli/issues/new?template=bug_report.md';
          if (bugDescription) {
            const encodedArgs = encodeURIComponent(bugDescription);
            bugReportUrl += `&title=${encodedArgs}`;
          }
          const encodedBody = encodeURIComponent(diagnosticInfo);
          bugReportUrl += `&body=${encodedBody}`;

          addMessage({
            type: MessageType.INFO,
            content: `To submit your bug report, please open the following URL in your browser:\n${bugReportUrl}`,
            timestamp: new Date(),
          });
          (async () => {
            try {
              await open(bugReportUrl);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              addMessage({
                type: MessageType.ERROR,
                content: `Could not open URL in browser: ${errorMessage}`,
                timestamp: new Date(),
              });
            }
          })();
        },
      },
      {
        name: 'quit',
        altName: 'exit',
        description: 'exit the cli',
        action: (_mainCommand, _subCommand, _args) => {
          onDebugMessage('Quitting. Good-bye.');
          process.exit(0);
        },
      },
    ],
    [
      onDebugMessage,
      setShowHelp,
      refreshStatic,
      openThemeDialog,
      clearItems,
      performMemoryRefresh,
      showMemoryAction,
      addMemoryAction,
      addMessage,
      toggleCorgiMode,
      config,
    ],
  );

  const handleSlashCommand = useCallback(
    (rawQuery: PartListUnion): SlashCommandActionReturn | boolean => {
      if (typeof rawQuery !== 'string') {
        return false;
      }
      const trimmed = rawQuery.trim();
      if (!trimmed.startsWith('/') && !trimmed.startsWith('?')) {
        return false;
      }
      const userMessageTimestamp = Date.now();
      addItem({ type: MessageType.USER, text: trimmed }, userMessageTimestamp);

      let subCommand: string | undefined;
      let args: string | undefined;

      const commandToMatch = (() => {
        if (trimmed.startsWith('?')) {
          return 'help';
        }
        const parts = trimmed.substring(1).trim().split(/\s+/);
        if (parts.length > 1) {
          subCommand = parts[1];
        }
        if (parts.length > 2) {
          args = parts.slice(2).join(' ');
        }
        return parts[0];
      })();

      const mainCommand = commandToMatch;

      for (const cmd of slashCommands) {
        if (mainCommand === cmd.name || mainCommand === cmd.altName) {
          const actionResult = cmd.action(mainCommand, subCommand, args);
          if (
            typeof actionResult === 'object' &&
            actionResult?.shouldScheduleTool
          ) {
            return actionResult; // Return the object for useGeminiStream
          }
          return true; // Command was handled, but no tool to schedule
        }
      }

      addMessage({
        type: MessageType.ERROR,
        content: `Unknown command: ${trimmed}`,
        timestamp: new Date(),
      });
      return true; // Indicate command was processed (even if unknown)
    },
    [addItem, slashCommands, addMessage],
  );

  return { handleSlashCommand, slashCommands };
};
