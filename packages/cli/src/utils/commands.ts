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
  let parentCommand: SlashCommand | undefined;

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

    if (foundCommand) {
      parentCommand = commandToExecute;
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

  // Backtrack if the matched (sub)command doesn't take arguments but some were provided,
  // AND the parent command is capable of handling them.
  if (
    commandToExecute &&
    commandToExecute.takesArgs === false &&
    args.length > 0 &&
    parentCommand &&
    parentCommand.action
  ) {
    return {
      commandToExecute: parentCommand,
      args: parts.slice(pathIndex - 1).join(' '),
      canonicalPath: canonicalPath.slice(0, -1),
    };
  }

  return { commandToExecute, args, canonicalPath };
};

/**
 * Counts the number of whitespace-separated arguments in a string.
 */
export const countArgs = (args: string): number => {
  const trimmed = args.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

/**
 * Validates argument count against a command's argsSpec.
 * Returns an error string if invalid, undefined if valid.
 * Appends usage hint from the command description when available.
 */
export const validateArgs = (
  args: string,
  argsSpec: SlashCommand['argsSpec'],
  commandPath: string[],
  description?: string,
): string | undefined => {
  if (!argsSpec) return undefined;

  const count = countArgs(args);
  const min = argsSpec.min ?? 0;
  const max = argsSpec.max;
  const cmd = `/${commandPath.join(' ')}`;

  const usageHint = (() => {
    const match = description?.match(/Usage:\s*(\S.*)/i);
    return match ? ` Usage: ${match[1]}` : '';
  })();

  if (count < min) {
    if (count === 0 && min === 1) {
      return `${cmd} requires at least 1 argument.${usageHint}`;
    }
    return `${cmd} requires at least ${min} argument${min === 1 ? '' : 's'}, but got ${count}.${usageHint}`;
  }

  if (max !== undefined && count > max) {
    if (max === 0) {
      return `${cmd} does not accept any arguments.`;
    }
    return `${cmd} accepts at most ${max} argument${max === 1 ? '' : 's'}, but got ${count}.${usageHint}`;
  }

  return undefined;
};
