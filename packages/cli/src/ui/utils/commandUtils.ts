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
export const isAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @, then a non-space character.
  query.startsWith('@') || /\s@\S/.test(query);

/**
 * Checks if a query string potentially represents an '/' command.
 * It triggers if the query starts with '/'
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean => query.startsWith('/');

const control_symbols: string[] = ['/', '@', '!', '?', '$'];
/**
 * Returns the first word of query with optional leading slash, ampersand, bang.
 *
 * @param query The input query string.
 * @returns optional leading symbol and first word of query
 */
export const getCommandFromQuery = (
  query: string,
): [string | undefined, string] => {
  const word = query.trim().split(/\s/, 1)[0];
  if (word.length > 0 && control_symbols.includes(word[0])) {
    return [word[0], word.slice(1)];
  }
  return [undefined, word];
};
