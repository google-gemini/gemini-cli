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
    let pattern = commandRegex;

    // 1. Handle ^ (Start Anchor)
    // If the regex starts with ^, we remove it because the pattern is already
    // implicitly anchored to the start of the command value by the prepended
    // "command":" prefix. We only do this if it's not escaped.
    if (pattern.startsWith('^')) {
      pattern = pattern.slice(1);
    }

    // 2. Handle $ (End Anchor)
    // If the regex ends with $, we replace it with "(?:,|\\}) to match the
    // closing quote of the command value in the JSON-stringified arguments.
    // We only do this if the $ is not escaped by an odd number of backslashes.
    if (pattern.endsWith('$')) {
      let backslashCount = 0;
      for (let i = pattern.length - 2; i >= 0; i--) {
        if (pattern[i] === '\\') {
          backslashCount++;
        } else {
          break;
        }
      }

      if (backslashCount % 2 === 0) {
        // Anchor to the end of the JSON string value: " followed by , or }
        pattern = pattern.slice(0, -1) + '"(?:,|\\})';
      }
    }

    return [`"command":"${pattern}`];
  }

  return [argsPattern];
}
