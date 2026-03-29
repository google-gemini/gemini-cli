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
 * Parses a raw slash command string into its command, arguments, and canonical path.
 * If no valid command is found, the `commandToExecute` property will be `undefined`.
 *
 * @param query The raw input string, e.g., "/memory add some data" or "/help".
 * @param commands The list of available top-level slash commands.
 * @returns An object containing the resolved command, its arguments, and its canonical path.
 */
export const parseSlashCommand = (
  query: string,
  commands: readonly SlashCommand[],
): ParsedSlashCommand => {
  const trimmed = query.trim();
  const parts = trimmed.substring(1).trim().split(/\s+/);
  const commandPath = parts.filter((p) => p); // The parts of the command, e.g., ['memory', 'add']
  let currentCommands = commands;
  let commandToExecute: SlashCommand | undefined;
  let pathIndex = 0;
  const canonicalPath: string[] = [];

  // TODO: For better performance and architectural clarity, this two-pass
  // search could be replaced. A more optimal approach would be to
  // pre-compute a single lookup map in `CommandService.ts` that resolves
  // all name and alias conflicts during the initial loading phase. The
  // processor would then perform a single, fast lookup on that map.
  const buildCommandMap = (
    cmds: readonly SlashCommand[],
  ): Map<string, SlashCommand> => {
    const map = new Map<string, SlashCommand>();
    // First pass: register all primary names (highest priority)
    for (const cmd of cmds) {
      map.set(cmd.name, cmd);
    }
    // Second pass: register aliases only if not already taken by a primary name
    for (const cmd of cmds) {
      for (const alias of cmd.altNames ?? []) {
        if (!map.has(alias)) {
          map.set(alias, cmd);
        }
      }
    }
    return map;
  };

  let currentMap = buildCommandMap(currentCommands);

  for (const part of commandPath) {
    // TODO: For better performance and architectural clarity, this two-pass
    // search could be replaced. A more optimal approach would be to
    // pre-compute a single lookup map in `CommandService.ts` that resolves
    // all name and alias conflicts during the initial loading phase. The
    // processor would then perform a single, fast lookup on that map.
    // First pass: check for an exact match on the primary command name.
    // Second pass: if no primary name matches, check for an alias.
    // Both passes are now handled securely by the pre-computed map above.
    const foundCommand = currentMap.get(part);

    if (foundCommand) {
      commandToExecute = foundCommand;
      canonicalPath.push(foundCommand.name);
      pathIndex++;
      if (foundCommand.subCommands) {
        currentCommands = foundCommand.subCommands;
        currentMap = buildCommandMap(currentCommands);
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
