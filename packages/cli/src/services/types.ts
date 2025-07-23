/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand } from '../ui/commands/types.js';

/**
 * Defines the contract for any class that can load and provide slash commands.
 * This allows the CommandService to be extended with new command sources
 * (e.g., file-based, remote APIs) without modification.
 *
 * Loaders should receive any necessary dependencies (like Config) via their
 * constructor.
 */
export interface ICommandLoader {
  /**
   * Discovers and returns a list of slash commands from the loader's source.
   * @param signal An AbortSignal to allow cancellation.
   * @returns A promise that resolves to an array of SlashCommand objects.
   */
  loadCommands(signal: AbortSignal): Promise<SlashCommand[]>;
}
