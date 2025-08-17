/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  getErrorMessage,
  getMCPServerPrompts,
} from '@google/gemini-cli-core';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from '../ui/commands/types.js';
import { ICommandLoader } from './types.js';
import { PromptArgument } from '@modelcontextprotocol/sdk/types.js';

/**
 * Discovers and loads executable slash commands from prompts exposed by
 * Model-Context-Protocol (MCP) servers.
 */
export class McpPromptLoader implements ICommandLoader {
  constructor(private readonly config: Config | null) {}

  /**
   * Loads all available prompts from all configured MCP servers and adapts
   * them into executable SlashCommand objects.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of loaded SlashCommands.
   */
  loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    const promptCommands: SlashCommand[] = [];
    if (!this.config) {
      return Promise.resolve([]);
    }
    const mcpServers = this.config.getMcpServers() || {};
    for (const serverName in mcpServers) {
      const prompts = getMCPServerPrompts(this.config, serverName) || [];
      for (const prompt of prompts) {
        const commandName = `${prompt.name}`;
        const newPromptCommand: SlashCommand = {
          name: commandName,
          description: prompt.description || `Invoke prompt ${prompt.name}`,
          kind: CommandKind.MCP_PROMPT,
          subCommands: [
            {
              name: 'help',
              description: 'Show help for this prompt',
              kind: CommandKind.MCP_PROMPT,
              action: async (): Promise<SlashCommandActionReturn> => {
                if (!prompt.arguments || prompt.arguments.length === 0) {
                  return {
                    type: 'message',
                    messageType: 'info',
                    content: `Prompt "${prompt.name}" has no arguments.`,
                  };
                }

                let helpMessage = `Arguments for "${prompt.name}":\n\n`;
                if (prompt.arguments && prompt.arguments.length > 0) {
                  helpMessage += `You can provide arguments by name (e.g., --argName="value") or by position.\n\n`;
                  helpMessage += `e.g., ${prompt.name} ${prompt.arguments?.map((_) => `"foo"`)} is equivalent to ${prompt.name} ${prompt.arguments?.map((arg) => `--${arg.name}="foo"`)}\n\n`;
                }
                for (const arg of prompt.arguments) {
                  helpMessage += `  --${arg.name}\n`;
                  if (arg.description) {
                    helpMessage += `    ${arg.description}\n`;
                  }
                  helpMessage += `    (required: ${
                    arg.required ? 'yes' : 'no'
                  })\n\n`;
                }
                return {
                  type: 'message',
                  messageType: 'info',
                  content: helpMessage,
                };
              },
            },
          ],
          action: async (
            context: CommandContext,
            args: string,
          ): Promise<SlashCommandActionReturn> => {
            if (!this.config) {
              return {
                type: 'message',
                messageType: 'error',
                content: 'Config not loaded.',
              };
            }

            const promptInputs = this.parseArgs(args, prompt.arguments);
            if (promptInputs instanceof Error) {
              return {
                type: 'message',
                messageType: 'error',
                content: promptInputs.message,
              };
            }

            try {
              const mcpServers = this.config.getMcpServers() || {};
              const mcpServerConfig = mcpServers[serverName];
              if (!mcpServerConfig) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: `MCP server config not found for '${serverName}'.`,
                };
              }
              const result = await prompt.invoke(promptInputs);

              if (result['error']) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content: `Error invoking prompt: ${result['error']}`,
                };
              }

              if (!result.messages?.[0]?.content?.['text']) {
                return {
                  type: 'message',
                  messageType: 'error',
                  content:
                    'Received an empty or invalid prompt response from the server.',
                };
              }

              return {
                type: 'submit_prompt',
                content: JSON.stringify(result.messages[0].content.text),
              };
            } catch (error) {
              return {
                type: 'message',
                messageType: 'error',
                content: `Error: ${getErrorMessage(error)}`,
              };
            }
          },
          completion: async (_: CommandContext, partialArg: string) => {
            if (!prompt || !prompt.arguments) {
              return [];
            }

            const suggestions: string[] = [];
            const usedArgNames = new Set(
              (partialArg.match(/--([^=]+)/g) || []).map((s) => s.substring(2)),
            );

            for (const arg of prompt.arguments) {
              if (!usedArgNames.has(arg.name)) {
                suggestions.push(`--${arg.name}=""`);
              }
            }

            return suggestions;
          },
        };
        promptCommands.push(newPromptCommand);
      }
    }
    return Promise.resolve(promptCommands);
  }

  private parseArgs(
    userArgs: string,
    promptArgs: PromptArgument[] | undefined,
  ): Record<string, unknown> | Error {
    const argValues: { [key: string]: string } = {};
    const promptInputs: Record<string, unknown> = {};

    // arg parsing: --key="value" or --key=value
    const namedArgRegex = /--([^=]+)=(?:"((?:\\.|[^"\\])*)"|([^ ]*))/g;
    let match;
    const remainingArgs: string[] = [];
    let lastIndex = 0;

    while ((match = namedArgRegex.exec(userArgs)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3]; // Quoted or unquoted value
      argValues[key] = value;
      // Capture text between matches as potential positional args
      if (match.index > lastIndex) {
        remainingArgs.push(userArgs.substring(lastIndex, match.index).trim());
      }
      lastIndex = namedArgRegex.lastIndex;
    }

    // Capture any remaining text after the last named arg
    if (lastIndex < userArgs.length) {
      remainingArgs.push(userArgs.substring(lastIndex).trim());
    }

    const positionalArgs = remainingArgs.join(' ').split(/ +/);

    if (!promptArgs) {
      return promptInputs;
    }
    for (const arg of promptArgs) {
      if (argValues[arg.name]) {
        promptInputs[arg.name] = argValues[arg.name];
      }
    }

    const unfilledArgs = promptArgs.filter(
      (arg) => arg.required && !promptInputs[arg.name],
    );

    const missingArgs: string[] = [];
    for (let i = 0; i < unfilledArgs.length; i++) {
      if (positionalArgs.length > i && positionalArgs[i]) {
        promptInputs[unfilledArgs[i].name] = positionalArgs[i];
      } else {
        missingArgs.push(unfilledArgs[i].name);
      }
    }

    if (missingArgs.length > 0) {
      const missingArgNames = missingArgs.map((name) => `--${name}`).join(', ');
      return new Error(`Missing required argument(s): ${missingArgNames}`);
    }
    return promptInputs;
  }
}
