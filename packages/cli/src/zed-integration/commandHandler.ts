/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Command, CommandContext } from './commands/types.js';
import { CommandRegistry } from './commands/commandRegistry.js';
import { MemoryCommand } from './commands/memory.js';
import { ExtensionsCommand } from './commands/extensions.js';
import { InitCommand } from './commands/init.js';
import { RestoreCommand } from './commands/restore.js';

export class CommandHandler {
  private registry: CommandRegistry;

  constructor() {
    this.registry = CommandHandler.createRegistry();
  }

  private static createRegistry(): CommandRegistry {
    const registry = new CommandRegistry();
    registry.register(new MemoryCommand());
    registry.register(new ExtensionsCommand());
    registry.register(new InitCommand());
    registry.register(new RestoreCommand());
    return registry;
  }

  getAvailableCommands(): Array<{ name: string; description: string }> {
    return this.registry.getAllCommands().map((cmd) => ({
      name: cmd.name,
      description: cmd.description,
    }));
  }

  /**
   * Parses and executes a command string if it matches a registered command.
   * Returns true if a command was handled, false otherwise.
   */
  async handleCommand(
    commandText: string,
    context: CommandContext,
  ): Promise<boolean> {
    const { commandToExecute, args } = this.parseSlashCommand(commandText);

    if (commandToExecute) {
      await this.runCommand(commandToExecute, args, context);
      return true;
    }

    return false;
  }

  private async runCommand(
    commandToExecute: Command,
    args: string,
    context: CommandContext,
  ): Promise<void> {
    try {
      const result = await commandToExecute.execute(
        context,
        args ? args.split(/\s+/) : [],
      );

      let messageContent = '';
      if (typeof result.data === 'string') {
        messageContent = result.data;
      } else if (
        typeof result.data === 'object' &&
        result.data !== null &&
        'content' in result.data
      ) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
        messageContent = (result.data as Record<string, any>)[
          'content'
        ] as string;
      } else {
        messageContent = JSON.stringify(result.data, null, 2);
      }

      await context.sendMessage(messageContent);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await context.sendMessage(`Error: ${errorMessage}`);
    }
  }

  /**
   * Parses a raw slash command string into its matching headless command and arguments.
   * Mirrors `packages/cli/src/utils/commands.ts` logic.
   */
  private parseSlashCommand(query: string): {
    commandToExecute: Command | undefined;
    args: string;
  } {
    const trimmed = query.trim();
    const parts = trimmed.substring(1).trim().split(/\s+/);
    const commandPath = parts.filter((p) => p);

    let currentCommands = this.registry.getAllCommands();
    let commandToExecute: Command | undefined;
    let pathIndex = 0;

    for (const part of commandPath) {
      const foundCommand = currentCommands.find((cmd) => {
        const expectedName = commandPath.slice(0, pathIndex + 1).join(' ');
        return (
          cmd.name === part ||
          cmd.name === expectedName ||
          cmd.aliases?.includes(part) ||
          cmd.aliases?.includes(expectedName)
        );
      });

      if (foundCommand) {
        commandToExecute = foundCommand;
        pathIndex++;
        if (foundCommand.subCommands) {
          currentCommands = foundCommand.subCommands;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    const args = parts.slice(pathIndex).join(' ');

    return { commandToExecute, args };
  }
}
