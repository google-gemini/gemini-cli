/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if a query string potentially represents an '@' command.
 * It triggers if the query starts with '@' or contains '@' preceded by whitespace
 * and followed by a non-whitespace character.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '@' command, false otherwise.
 */
export const isPotentiallyAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @, then a non-space character.
  query.startsWith('@') || /\s@\S/.test(query);

/**
 * Checks if a query string represents a slash command (starts with '/').
 *
 * @param query The input query string.
 * @returns True if the query is a slash command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean =>
  query.trim().startsWith('/');
