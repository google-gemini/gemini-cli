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
 * @param commandPrefix An optional command prefix (or list of prefixes/sequences) to allow.
 * @param commandRegex An optional command regex string to allow.
 * @param allowRedirection Whether to allow redirection operators in the command.
 * @returns An array of string patterns (or undefined) for the PolicyEngine.
 */
export function buildArgsPatterns(
  argsPattern?: string,
  commandPrefix?: string | Array<string | string[]>,
  commandRegex?: string,
  allowRedirection?: boolean,
): Array<string | undefined> {
  const shellSeparators = '&|;\n\r';
  const forbiddenChars = allowRedirection
    ? shellSeparators
    : `${shellSeparators}<>`;

  const forbiddenCharClass = `(?:[^"${forbiddenChars}]|\\\\")`;

  if (commandPrefix) {
    const prefixes = Array.isArray(commandPrefix)
      ? commandPrefix
      : [commandPrefix];

    return prefixes.map((prefix) => {
      if (Array.isArray(prefix)) {
        // Handle sequence matching (e.g., ['git', 'log'])
        // We want to match these tokens in order, allowing flags in between.
        if (prefix.length === 0) return undefined;

        // Escape each token and ensure word boundaries
        const escapedTokens = prefix.map((token) => escapeRegex(token));

        // Start with matching \0"command":"<first_token>
        let pattern = `\\x00${escapeRegex('"command":"')}${escapedTokens[0]}`;

        // For subsequent tokens, allow flags in between
        for (let i = 1; i < escapedTokens.length; i++) {
          // Allow whitespace or flags (starting with -) in between tokens.
          // [^"]*? is replaced by forbiddenCharClass to stay within the command string value
          // and avoid separators.
          const gap = `(?:(?:\\s+|-(?:${forbiddenCharClass})*?)\\s*)`;
          pattern += `${gap}*${escapedTokens[i]}`;
        }

        // After the last token, we also don't allow forbidden characters until the end of the command string.
        // We match until the closing quote of the command value followed by \0.
        // We add a word boundary if the last token ends in a word character.
        const suffix = /\w$/.test(prefix[prefix.length - 1]) ? '\\b' : '';
        return `${pattern}${suffix}(?:${forbiddenCharClass})*${escapeRegex('"')}\\x00`;
      }

      // JSON.stringify safely encodes the prefix in quotes.
      // We remove ONLY the trailing quote to match it as an open prefix string.
      const encodedPrefix = JSON.stringify(prefix);
      const openQuotePrefix = encodedPrefix.substring(
        0,
        encodedPrefix.length - 1,
      );

      // Escape the exact JSON literal segment we expect to see, including \0 boundary.
      const matchSegment = `\\x00${escapeRegex(
        `"command":${openQuotePrefix}`,
      )}`;

      // We allow any characters except forbidden shell separators until the closing quote and \0.
      // We add a word boundary if the prefix ends in a word character.
      const suffix = /\w$/.test(prefix) ? '\\b' : '';
      return `${matchSegment}${suffix}(?:${forbiddenCharClass})*${escapeRegex('"')}\\x00`;
    });
  }

  if (commandRegex) {
    return [
      `\\x00${escapeRegex('"command":"')}${commandRegex}(?:(?!${forbiddenChars})${forbiddenCharClass})*${escapeRegex('"')}\\x00`,
    ];
  }

  return [argsPattern];
}

/**
 * Builds a regex pattern to match a specific parameter and value in tool arguments.
 * This is used to narrow tool approvals to specific parameters.
 *
 * @param paramName The name of the parameter.
 * @param value The value to match.
 * @returns A regex string that matches "<paramName>":<value> in a JSON string.
 */
export function buildParamArgsPattern(
  paramName: string,
  value: unknown,
): string {
  const encodedValue = JSON.stringify(value);
  // We wrap the JSON string in escapeRegex and prepend/append \\x00 to explicitly
  // match top-level JSON properties generated by stableStringify, preventing
  // argument injection bypass attacks.
  return `\\x00${escapeRegex(`"${paramName}":${encodedValue}`)}\\x00`;
}

/**
 * Builds a regex pattern to match a specific file path in tool arguments.
 * This is used to narrow tool approvals for edit tools to specific files.
 *
 * @param filePath The relative path to the file.
 * @returns A regex string that matches "file_path":"<path>" in a JSON string.
 */
export function buildFilePathArgsPattern(filePath: string): string {
  return buildParamArgsPattern('file_path', filePath);
}

/**
 * Builds a regex pattern to match a specific directory path in tool arguments.
 * This is used to narrow tool approvals for list_directory tool.
 *
 * @param dirPath The path to the directory.
 * @returns A regex string that matches "dir_path":"<path>" in a JSON string.
 */
export function buildDirPathArgsPattern(dirPath: string): string {
  return buildParamArgsPattern('dir_path', dirPath);
}

/**
 * Builds a regex pattern to match a specific "pattern" in tool arguments.
 * This is used to narrow tool approvals for search tools like glob/grep to specific patterns.
 *
 * @param pattern The pattern to match.
 * @returns A regex string that matches "pattern":"<pattern>" in a JSON string.
 */
export function buildPatternArgsPattern(pattern: string): string {
  return buildParamArgsPattern('pattern', pattern);
}
