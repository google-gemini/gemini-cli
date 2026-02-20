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
      let fullName = this.resolveFullName(cmd);
      // Extension commands get renamed if they conflict with existing commands
      if (cmd.extensionName && commandMap.has(fullName)) {
        fullName = this.resolveConflict(
          fullName,
          cmd,
          commandMap,
          conflictsMap,
        );
      }

      commandMap.set(fullName, {
        ...cmd,
        name: fullName,
      });
    }

    const conflicts = Array.from(conflictsMap.values());
    this.emitConflicts(conflicts);

    const finalCommands = Object.freeze(Array.from(commandMap.values()));
    const finalConflicts = Object.freeze(conflicts);
    return new CommandService(finalCommands, finalConflicts);
  }

  /**
   * Prepends the namespace to the command name if provided and not already present.
   */
  private static resolveFullName(cmd: SlashCommand): string {
    if (!cmd.namespace) {
      return cmd.name;
    }

    const prefix = `${cmd.namespace}:`;
    return cmd.name.startsWith(prefix) ? cmd.name : `${prefix}${cmd.name}`;
  }

  /**
   * Resolves a naming conflict by generating a unique name for an extension command.
   * Also records the conflict for reporting.
   */
  private static resolveConflict(
    fullName: string,
    cmd: SlashCommand,
    commandMap: Map<string, SlashCommand>,
    conflictsMap: Map<string, CommandConflict>,
  ): string {
    const winner = commandMap.get(fullName)!;
    let renamedName = fullName;
    let suffix = 1;

    // Generate a unique name by appending an incrementing numeric suffix.
    while (commandMap.has(renamedName)) {
      renamedName = `${fullName}${suffix}`;
      suffix++;
    }

    // Record the conflict details for downstream reporting.
    if (!conflictsMap.has(fullName)) {
      conflictsMap.set(fullName, {
        name: fullName,
        winner,
        losers: [],
      });
    }

    conflictsMap.get(fullName)!.losers.push({
      command: cmd,
      renamedTo: renamedName,
    });

    return renamedName;
  }

  /**
   * Emits conflict events for all detected collisions.
   */
  private static emitConflicts(conflicts: CommandConflict[]): void {
    if (conflicts.length === 0) {
      return;
    }

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
