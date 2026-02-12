/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import type { SlashCommand } from '../ui/commands/types.js';
import type { ICommandLoader } from './types.js';

export interface CommandConflict {
  name: string;
  winner: SlashCommand;
  losers: Array<{
    command: SlashCommand;
    renamedTo: string;
  }>;
}

/**
 * Orchestrates the discovery and loading of all slash commands for the CLI.
 *
 * This service operates on a provider-based loader pattern. It is initialized
 * with an array of `ICommandLoader` instances, each responsible for fetching
 * commands from a specific source (e.g., built-in code, local files).
 *
 * The CommandService is responsible for invoking these loaders, aggregating their
 * results, and resolving any name conflicts. This architecture allows the command
 * system to be extended with new sources without modifying the service itself.
 */
export class CommandService {
  /**
   * Private constructor to enforce the use of the async factory.
   * @param commands A readonly array of the fully loaded and de-duplicated commands.
   * @param conflicts A readonly array of conflicts that occurred during loading.
   */
  private constructor(
    private readonly commands: readonly SlashCommand[],
    private readonly conflicts: readonly CommandConflict[],
  ) {}

  /**
   * Asynchronously creates and initializes a new CommandService instance.
   *
   * This factory method orchestrates the entire command loading process. It
   * runs all provided loaders in parallel, aggregates their results, handles
   * name conflicts for extension commands by renaming them, and then returns a
   * fully constructed `CommandService` instance.
   *
   * Conflict resolution:
   * - Extension commands that conflict with existing commands are renamed to
   *   `extensionName.commandName`
   * - Non-extension commands (built-in, user, project) override earlier commands
   *   with the same name based on loader order
   *
   * @param loaders An array of objects that conform to the `ICommandLoader`
   *   interface. Built-in commands should come first, followed by FileCommandLoader.
   * @param signal An AbortSignal to cancel the loading process.
   * @returns A promise that resolves to a new, fully initialized `CommandService` instance.
   */
  static async create(
    loaders: ICommandLoader[],
    signal: AbortSignal,
  ): Promise<CommandService> {
    const results = await Promise.allSettled(
      loaders.map((loader) => loader.loadCommands(signal)),
    );

    const allCommands: SlashCommand[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allCommands.push(...result.value);
      } else {
        debugLogger.debug('A command loader failed:', result.reason);
      }
    }

    const commandMap = new Map<string, SlashCommand>();
    const conflictsMap = new Map<string, CommandConflict>();

    for (const cmd of allCommands) {
      let finalName = cmd.name;

      // Extension commands get renamed if they conflict with existing commands
      if (cmd.extensionName && commandMap.has(cmd.name)) {
        const winner = commandMap.get(cmd.name)!;
        let renamedName = `${cmd.extensionName}.${cmd.name}`;
        let suffix = 1;

        // Keep trying until we find a name that doesn't conflict
        while (commandMap.has(renamedName)) {
          renamedName = `${cmd.extensionName}.${cmd.name}${suffix}`;
          suffix++;
        }

        finalName = renamedName;

        if (!conflictsMap.has(cmd.name)) {
          conflictsMap.set(cmd.name, {
            name: cmd.name,
            winner,
            losers: [],
          });
        }

        conflictsMap.get(cmd.name)!.losers.push({
          command: cmd,
          renamedTo: finalName,
        });
      }

      commandMap.set(finalName, {
        ...cmd,
        name: finalName,
      });
    }

    const conflicts = Array.from(conflictsMap.values());
    if (conflicts.length > 0) {
      coreEvents.emitSlashCommandConflicts(
        conflicts.flatMap((c) =>
          c.losers.map((l) => ({
            name: c.name,
            renamedTo: l.renamedTo,
            loserExtensionName: l.command.extensionName,
            winnerExtensionName: c.winner.extensionName,
          })),
        ),
      );
    }

    const finalCommands = Object.freeze(Array.from(commandMap.values()));
    const finalConflicts = Object.freeze(conflicts);
    return new CommandService(finalCommands, finalConflicts);
  }

  /**
   * Retrieves the currently loaded and de-duplicated list of slash commands.
   *
   * This method is a safe accessor for the service's state. It returns a
   * readonly array, preventing consumers from modifying the service's internal state.
   *
   * @returns A readonly, unified array of available `SlashCommand` objects.
   */
  getCommands(): readonly SlashCommand[] {
    return this.commands;
  }

  /**
   * Retrieves the list of conflicts that occurred during command loading.
   *
   * @returns A readonly array of command conflicts.
   */
  getConflicts(): readonly CommandConflict[] {
    return this.conflicts;
  }
}
