/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import type { SlashCommand } from '../ui/commands/types.js';
import { CommandKind } from '../ui/commands/types.js';
import type { ICommandLoader } from './types.js';

export interface CommandConflict {
  name: string;
  losers: Array<{
    command: SlashCommand;
    renamedTo: string;
    winner: SlashCommand;
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
   * name conflicts, and then returns a fully constructed `CommandService`
   * instance.
   *
   * Conflict resolution:
   * - Extension, user, and workspace commands that conflict with existing
   * commands are renamed to `extensionName.commandName`, `user.commandName` or
   * `workspace.commandName`.
   * - If multiple file-based commands conflict, all are prefixed and the
   * original non-prefixed mapping is removed.
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
    const firstEncounters = new Map<string, SlashCommand>();

    for (const cmd of allCommands) {
      const originalName = cmd.name;
      let finalName = originalName;

      // Handle name conflicts
      if (firstEncounters.has(originalName)) {
        const first = firstEncounters.get(originalName)!;

        // 1. Extension commands get renamed to extension.name if the name was ever claimed
        if (cmd.extensionName) {
          finalName = this.getRenamedExtensionName(cmd, commandMap);
          this.trackConflict(conflictsMap, originalName, first, cmd, finalName);
        }
        // 2. User/Workspace commands get prefixed if they conflict
        else if (
          cmd.kind === CommandKind.USER_FILE ||
          cmd.kind === CommandKind.WORKSPACE_FILE
        ) {
          const prefix = this.getKindPrefix(cmd.kind);
          finalName = prefix ? `${prefix}.${cmd.name}` : cmd.name;

          const existing = commandMap.get(originalName);
          // If the existing command is still in the map under the original name,
          // and it's a file-based command, rename it too.
          if (
            existing &&
            (existing.kind === CommandKind.USER_FILE ||
              existing.kind === CommandKind.WORKSPACE_FILE)
          ) {
            const existingPrefix = this.getKindPrefix(existing.kind);
            const renamedExistingName = `${existingPrefix}.${existing.name}`;

            commandMap.delete(originalName);
            const renamedExisting = { ...existing, name: renamedExistingName };
            commandMap.set(renamedExistingName, renamedExisting);

            // Report the existing one being renamed due to the current one
            this.trackConflict(
              conflictsMap,
              originalName,
              cmd, // winner is current
              existing, // loser is existing
              renamedExistingName,
            );
          }

          // Report the current one being renamed due to the first encountered one
          this.trackConflict(conflictsMap, originalName, first, cmd, finalName);
        }
      } else {
        // First time we've seen this command name
        firstEncounters.set(originalName, cmd);
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
            winnerExtensionName: l.winner.extensionName,
            loserKind: l.command.kind,
            winnerKind: l.winner.kind,
          })),
        ),
      );
    }

    const finalCommands = Object.freeze(Array.from(commandMap.values()));
    const finalConflicts = Object.freeze(conflicts);
    return new CommandService(finalCommands, finalConflicts);
  }

  /**
   * Generates a unique name for an extension command to avoid conflicts.
   */
  private static getRenamedExtensionName(
    cmd: SlashCommand,
    commandMap: Map<string, SlashCommand>,
  ): string {
    let renamedName = `${cmd.extensionName}.${cmd.name}`;
    let suffix = 1;

    // Keep trying until we find a name that doesn't conflict
    while (commandMap.has(renamedName)) {
      renamedName = `${cmd.extensionName}.${cmd.name}${suffix}`;
      suffix++;
    }
    return renamedName;
  }

  /**
   * Returns the short prefix string for user or workspace commands.
   */
  private static getKindPrefix(kind: CommandKind): string | null {
    if (kind === CommandKind.USER_FILE) {
      return 'user';
    }
    if (kind === CommandKind.WORKSPACE_FILE) {
      return 'workspace';
    }
    return null;
  }

  /**
   * Records a command conflict in the provided conflicts map.
   */
  private static trackConflict(
    conflictsMap: Map<string, CommandConflict>,
    originalName: string,
    winner: SlashCommand,
    loser: SlashCommand,
    renamedTo: string,
  ) {
    if (!conflictsMap.has(originalName)) {
      conflictsMap.set(originalName, {
        name: originalName,
        losers: [],
      });
    }

    conflictsMap.get(originalName)!.losers.push({
      command: loser,
      renamedTo,
      winner,
    });
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
