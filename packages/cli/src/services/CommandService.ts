/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import type { SlashCommand } from '../ui/commands/types.js';
import type { ICommandLoader, CommandConflict } from './types.js';
import { SlashCommandResolver } from './SlashCommandResolver.js';

/**
 * Orchestrates the discovery and loading of all slash commands for the CLI.
 *
 * This service operates on a provider-based loader pattern. It is initialized
 * with an array of `ICommandLoader` instances, each responsible for fetching
 * commands from a specific source (e.g., built-in code, local files).
 *
 * It uses a delegating resolver to reconcile name conflicts, ensuring that
 * all commands are uniquely addressable via source-specific prefixes while
 * allowing built-in commands to retain their primary names.
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
   * This factory method orchestrates the loading process and delegates
   * conflict resolution to the SlashCommandResolver.
   *
   * @param loaders An array of loaders to fetch commands from.
   * @param signal An AbortSignal to allow cancellation.
   * @returns A promise that resolves to a fully initialized CommandService.
   */
  static async create(
    loaders: ICommandLoader[],
    signal: AbortSignal,
  ): Promise<CommandService> {
    const allCommands = await this.loadAllCommands(loaders, signal);
    const { finalCommands, conflicts } =
      SlashCommandResolver.resolve(allCommands);

    if (conflicts.length > 0) {
      this.emitConflictEvents(conflicts);
    }

    return new CommandService(
      Object.freeze(finalCommands),
      Object.freeze(conflicts),
    );
  }

  /**
   * Invokes all loaders in parallel and flattens the results.
   */
  private static async loadAllCommands(
    loaders: ICommandLoader[],
    signal: AbortSignal,
  ): Promise<SlashCommand[]> {
    const results = await Promise.allSettled(
      loaders.map((loader) => loader.loadCommands(signal)),
    );

    const commands: SlashCommand[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        commands.push(...result.value);
      } else {
        debugLogger.debug('A command loader failed:', result.reason);
      }
    }
    return commands;
  }

  /**
   * Formats and emits telemetry for command conflicts.
   */
  private static emitConflictEvents(conflicts: CommandConflict[]): void {
    coreEvents.emitSlashCommandConflicts(
      conflicts.flatMap((c) =>
        c.losers.map((l) => ({
          name: c.name,
          renamedTo: l.renamedTo,
          loserExtensionName: l.command.extensionName,
          winnerExtensionName: l.reason.extensionName,
          loserMcpServerName: l.command.mcpServerName,
          winnerMcpServerName: l.reason.mcpServerName,
          loserKind: l.command.kind,
          winnerKind: l.reason.kind,
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
