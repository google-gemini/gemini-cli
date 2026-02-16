/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SlashCommand } from '../ui/commands/types.js';

export type ParsedSlashCommand = {
  commandToExecute: SlashCommand | undefined;
  args: string;
  canonicalPath: string[];
};

/**
 * A flattened command map that allows O(1) lookup of commands by name or alias.
 * Maps command names and aliases to their canonical command and sub-commands.
 */
interface CommandLookupMap {
  [key: string]: {
    command: SlashCommand;
    subCommands?: readonly SlashCommand[];
  };
}

/**
 * Builds a flat lookup map from a command tree for O(1) command resolution.
 * This map includes both primary names and aliases, all pointing to their
 * canonical command objects.
 *
 * @param commands The list of top-level commands
 * @returns A flat map for fast command lookup
 */
function buildCommandLookupMap(
  commands: readonly SlashCommand[],
): CommandLookupMap {
  const map: CommandLookupMap = {};

  function addCommand(command: SlashCommand) {
    // Add primary name
    map[command.name] = { command };

    // Add aliases
    if (command.altNames) {
      for (const alias of command.altNames) {
        map[alias] = { command };
      }
    }

    // Recursively add sub-commands
    if (command.subCommands) {
      for (const subCommand of command.subCommands) {
        addCommand(subCommand);
      }
    }
  }

  for (const command of commands) {
    addCommand(command);
  }

  return map;
}

/**
 * Parses a raw slash command string into its command, arguments, and canonical path.
 * If no valid command is found, the `commandToExecute` property will be `undefined`.
 *
 * This version uses a pre-computed lookup map for O(1) command resolution,
 * significantly improving performance over the previous two-pass search algorithm.
 *
 * @param query The raw input string, e.g., "/memory add some data" or "/help".
 * @param commands The list of available top-level slash commands.
 * @param commandLookup Optional pre-computed lookup map. If provided, it will be
 *        used for O(1) lookups. If not provided, it will be built from commands.
 * @returns An object containing the resolved command, its arguments, and its canonical path.
 */
export const parseSlashCommand = (
  query: string,
  commands: readonly SlashCommand[],
  commandLookup?: CommandLookupMap,
): ParsedSlashCommand => {
  const trimmed = query.trim();

  const parts = trimmed.substring(1).trim().split(/\s+/);
  const commandPath = parts.filter((p) => p); // The parts of the command, e.g., ['memory', 'add']

  let commandToExecute: SlashCommand | undefined;
  let pathIndex = 0;
  const canonicalPath: string[] = [];

  // Use the provided lookup map or build one on-demand
  const lookup = commandLookup ?? buildCommandLookupMap(commands);

  let currentCommands = commands;

  for (const part of commandPath) {
    // Use O(1) lookup instead of two-pass search
    const lookupEntry = lookup[part];
    const foundCommand = lookupEntry?.command;

    // Verify the command is in the current level (not a sub-command at wrong level)
    if (foundCommand && currentCommands.includes(foundCommand)) {
      commandToExecute = foundCommand;
      canonicalPath.push(foundCommand.name);
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

  return { commandToExecute, args, canonicalPath };
};

/**
 * Creates a pre-computed command lookup map for fast command resolution.
 * This should be called once during initialization and the result should be
 * passed to parseSlashCommand for optimal performance.
 *
 * @param commands The list of available top-level slash commands.
 * @returns A pre-computed lookup map for O(1) command resolution.
 */
export function createCommandLookupMap(
  commands: readonly SlashCommand[],
): CommandLookupMap {
  return buildCommandLookupMap(commands);
}
