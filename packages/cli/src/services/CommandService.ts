/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';
import { ICommandLoader } from './types.js';

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
  // Use ReadonlyArray to enforce immutability on our internal state.
  private commands: readonly SlashCommand[] = [];

  /**
   * Constructs the CommandService.
   *
   * @param loaders An array of objects that conform to the `ICommandLoader`
   *   interface. The order of loaders is significant: if multiple loaders
   *   provide a command with the same name, the command from the loader that
   *   appears later in the array will take precedence and override any earlier ones.
   */
  constructor(private loaders: ICommandLoader[]) {}

  /**
   * Triggers all registered command loaders to discover and load their respective
   * commands.
   *
   * This method runs all loaders in parallel using `Promise.allSettled` to ensure
   * that a failure in one loader does not prevent others from succeeding. It
   * aggregates the results from successful loaders, resolves any name conflicts
   * by letting the last-loaded command win, and stores the unified list internally.
   *
   * @returns A promise that resolves when all loading and processing is complete.
   */
  async loadCommands(): Promise<void> {
    const results = await Promise.allSettled(
      this.loaders.map((loader) => loader.loadCommands()),
    );

    const allCommands: SlashCommand[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allCommands.push(...result.value);
      } else {
        console.debug('A command loader failed:', result.reason);
      }
    }

    // De-duplicate commands using a Map. The last one found with a given name wins.
    // This creates a natural override system based on the order of the loaders
    // passed to the constructor.
    const commandMap = new Map<string, SlashCommand>();
    for (const cmd of allCommands) {
      commandMap.set(cmd.name, cmd);
    }

    this.commands = Object.freeze(Array.from(commandMap.values()));
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
}
