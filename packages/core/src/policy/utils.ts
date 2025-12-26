/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escapes a string for use in a regular expression.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Builds a list of args patterns for policy matching.
 *
 * This function handles the transformation of command prefixes and regexes into
 * the internal argsPattern representation used by the PolicyEngine.
 *
 * @param argsPattern An optional raw regex string for arguments.
 * @param commandPrefix An optional command prefix (or list of prefixes) to allow.
 * @param commandRegex An optional command regex string to allow.
 * @returns An array of string patterns (or undefined) for the PolicyEngine.
 */
export function buildArgsPatterns(
  argsPattern?: string,
  commandPrefix?: string | string[],
  commandRegex?: string,
): Array<string | undefined> {
  let effectiveArgsPattern = argsPattern;
  const commandPrefixes: string[] = [];

  if (commandPrefix) {
    const prefixes = Array.isArray(commandPrefix)
      ? commandPrefix
      : [commandPrefix];
    commandPrefixes.push(...prefixes);
  } else if (commandRegex) {
    effectiveArgsPattern = `"command":"${commandRegex}`;
  }

  // Expand command prefixes to multiple patterns.
  // We append [\\s"] to ensure we match whole words only (e.g., "git" but not "github").
  // Since we match against JSON stringified args, the value is always followed by a space or a closing quote.
  return commandPrefixes.length > 0
    ? commandPrefixes.map(
        (prefix) => `"command":"${escapeRegex(prefix)}(?:[\\s"]|$)`,
      )
    : [effectiveArgsPattern];
}
