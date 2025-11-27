/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import clipboardy from 'clipboardy';
import type { SlashCommand } from '../commands/types.js';
import { CommandKind } from '../commands/types.js';

/**
 * Checks if a query string potentially represents an '@' command.
 * It triggers if the query starts with '@' or contains '@' preceded by whitespace
 * and followed by a non-whitespace character.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '@' command, false otherwise.
 */
export const isAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @
  query.startsWith('@') || /\s@/.test(query);

/**
 * Checks if a query string potentially represents an '/' command.
 * It triggers if the query starts with '/' but excludes code comments like '//' and '/*'.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean => {
  if (!query.startsWith('/')) {
    return false;
  }

  // Exclude line comments that start with '//'
  if (query.startsWith('//')) {
    return false;
  }

  // Exclude block comments that start with '/*'
  if (query.startsWith('/*')) {
    return false;
  }

  return true;
};

// Copies a string snippet to the clipboard
export const copyToClipboard = async (text: string): Promise<void> => {
  await clipboardy.write(text);
};

export const getUrlOpenCommand = (): string => {
  // --- Determine the OS-specific command to open URLs ---
  let openCmd: string;
  switch (process.platform) {
    case 'darwin':
      openCmd = 'open';
      break;
    case 'win32':
      openCmd = 'start';
      break;
    case 'linux':
      openCmd = 'xdg-open';
      break;
    default:
      // Default to xdg-open, which appears to be supported for the less popular operating systems.
      openCmd = 'xdg-open';
      debugLogger.warn(
        `Unknown platform: ${process.platform}. Attempting to open URLs with: ${openCmd}.`,
      );
      break;
  }
  return openCmd;
};

/**
 * Determines if a slash command should auto-execute when selected.
 *
 * A command is auto-executable if it:
 * - Has an action (is executable)
 * - Has no subcommands (is not a parent command)
 * - Has no completion function (doesn't expect arguments)
 * - Is NOT a custom command from .toml files (they often accept arguments)
 *
 * @param command The slash command to check
 * @returns true if the command should auto-execute on Enter
 */
export function isAutoExecutableCommand(
  command: SlashCommand | undefined,
): boolean {
  if (!command) {
    return false;
  }

  // Custom commands from .toml files should not auto-execute
  // They often accept arguments but have no completion metadata
  if (command.kind === CommandKind.FILE) {
    return false;
  }

  return (
    command.action !== undefined &&
    (!command.subCommands || command.subCommands.length === 0) &&
    command.completion === undefined
  );
}
