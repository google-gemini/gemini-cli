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

  // EDITED: Added helper function for single-pass lookup
  const findCommand = (name: string, commands: readonly SlashCommand[]) =>
    commands.find((cmd) => cmd.name === name || cmd.altNames?.includes(name));

  // EDITED: Replaced old two-pass loop with single-pass loop using findCommand
  for (const part of commandPath) {
    const foundCommand = findCommand(part, currentCommands);

    if (!foundCommand) break;

    commandToExecute = foundCommand;
    canonicalPath.push(foundCommand.name);
    pathIndex++;
    if (foundCommand.subCommands) {
      currentCommands = foundCommand.subCommands;
    } else {
      break;
    }
  }

  const args = parts.slice(pathIndex).join(' ');

  return { commandToExecute, args, canonicalPath };
};
