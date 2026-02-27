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
  if (commandPrefix) {
    const prefixes = Array.isArray(commandPrefix)
      ? commandPrefix
      : [commandPrefix];

    // Expand command prefixes to multiple patterns.
    // We append [\\s"] to ensure we match whole words only (e.g., "git" but not
    // "github"). Since we match against JSON stringified args, the value is
    // always followed by a space or a closing quote.
    return prefixes.map((prefix) => {
      const jsonPrefix = JSON.stringify(prefix).slice(1, -1);
      // We allow [\s], ["], or the specific sequence [\"] (for escaped quotes
      // in JSON). We do NOT allow generic [\\], which would match "git\status"
      // -> "gitstatus".
      return `"command":"${escapeRegex(jsonPrefix)}(?:[\\s"]|\\\\")`;
    });
  }

  if (commandRegex) {
    return [`"command":"${commandRegex}`];
  }

  return [argsPattern];
}
