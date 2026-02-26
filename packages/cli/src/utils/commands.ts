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

  for (const part of commandPath) {
    // TODO: For better performance and architectural clarity, this two-pass
    // search could be replaced. A more optimal approach would be to
    // pre-compute a single lookup map in `CommandService.ts` that resolves
    // all name and alias conflicts during the initial loading phase. The
    // processor would then perform a single, fast lookup on that map.

    // First pass: check for an exact match on the primary command name.
    let foundCommand = currentCommands.find((cmd) => cmd.name === part);

    // Second pass: if no primary name matches, check for an alias.
    if (!foundCommand) {
      foundCommand = currentCommands.find((cmd) =>
        cmd.altNames?.includes(part),
      );
    }

    // Third pass: match by bare name, stripping the namespace prefix.
    // Commands from FileCommandLoader are stored with namespaced names
    // (e.g., "workspace:my_command") but users may invoke them by bare name
    // (e.g., "/my_command") especially via the -p flag where there is no
    // autocomplete to insert the full namespaced name. Prefer later entries
    // so workspace-scoped commands take precedence over user-scoped ones.
    if (!foundCommand) {
      for (const cmd of currentCommands) {
        if (cmd.namespace) {
          const prefix = `${cmd.namespace}:`;
          if (
            cmd.name.startsWith(prefix) &&
            cmd.name.substring(prefix.length) === part
          ) {
            foundCommand = cmd;
          }
        }
      }
    }

    if (foundCommand) {
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
