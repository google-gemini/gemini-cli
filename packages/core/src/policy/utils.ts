/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Escapes a string for use in a regular expression.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s"]/g, '\\$&');
}

/**
 * Basic validation for regular expressions to prevent common ReDoS patterns.
 * This is a heuristic check and not a substitute for a full ReDoS scanner.
 */
export function isSafeRegExp(pattern: string): boolean {
  try {
    // 1. Ensure it's a valid regex
    new RegExp(pattern);
  } catch {
    return false;
  }

  // 2. Limit length to prevent extremely long regexes
  if (pattern.length > 2048) {
    return false;
  }

  // 3. Heuristic: Check for nested quantifiers which are a primary source of ReDoS.
  // Examples: (a+)+, (a|b)*, (.*)*, ([a-z]+)+
  // We look for a group (...) followed by a quantifier (+, *, or {n,m})
  // where the group itself contains a quantifier.
  // This matches a '(' followed by some content including a quantifier, then ')',
  // followed by another quantifier.
  const nestedQuantifierPattern = /\([^)]*[*+?{].*\)[*+?{]/;
  if (nestedQuantifierPattern.test(pattern)) {
    return false;
  }

  return true;
}

/**
 * Metadata about an arguments pattern for policy matching.
 */
export interface ArgsPatternInfo {
  /**
   * The regular expression pattern string.
   */
  pattern?: string;

  /**
   * Optional name of a specific argument to match the pattern against.
   * If undefined, the pattern matches against the full JSON arguments string.
   */
  argName?: string;
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
 * @returns An array of pattern info objects for the PolicyEngine.
 */
export function buildArgsPatterns(
  argsPattern?: string,
  commandPrefix?: string | string[],
  commandRegex?: string,
): ArgsPatternInfo[] {
  if (commandPrefix) {
    const prefixes = Array.isArray(commandPrefix)
      ? commandPrefix
      : [commandPrefix];

    // Expand command prefixes to multiple patterns.
    // We now match against the 'command' argument directly.
    return prefixes.map((prefix) => {
      // For prefixes, we match the string followed by whitespace or end-of-string.
      // We trim the prefix and then ensure it's followed by a separator to
      // match whole words (e.g. 'git' matches 'git status' but not 'github').
      const trimmedPrefix = prefix.trim();
      return {
        pattern: `^${escapeRegex(trimmedPrefix)}(?:\\s|$)`,
        argName: 'command',
      };
    });
  }

  if (commandRegex) {
    // For commandRegex, we match against the 'command' argument directly.
    // Standard anchors (^, $) work as expected relative to the command string.
    return [
      {
        pattern: commandRegex,
        argName: 'command',
      },
    ];
  }

  return [{ pattern: argsPattern }];
}
