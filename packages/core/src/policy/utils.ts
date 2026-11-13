/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafeRegExp } from './safe-regex.js';

/**
 * Escapes a string for use in a regular expression.
 *
 * Only ASCII whitespace is escaped. Non-ASCII whitespace is an ordinary literal
 * in every regex dialect, and the linear-time engine used for policy patterns
 * rejects a backslash in front of a non-ASCII character.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#"\t\n\v\f\r ]/g, '\\$&');
}

/** Patterns longer than this are rejected without being compiled. */
const MAX_PATTERN_LENGTH = 2048;

/**
 * Patterns that compile to more instructions than this are rejected. Matching
 * cost grows with the compiled size, and repetition counts multiply it. For
 * example, `.{1000}` compiles to about 1,000 instructions and `.{1000}.{1000}`
 * to about 2,000.
 */
export const MAX_PROGRAM_SIZE = 2000;

/**
 * Check for nested quantifiers such as (a+)+, (.*)*, or ([a-z]+)+: a group that
 * contains a quantifier and is itself followed by one.
 *
 * It predates the linear-time engine and is kept so that the set of accepted
 * patterns does not grow. It is evaluated by the linear-time engine as well.
 * `[^\n\r\x{2028}\x{2029}]` spells out what JavaScript's `.` matches.
 */
const NESTED_QUANTIFIER = SafeRegExp.compile(
  String.raw`\([^)]*[*+?{][^\n\r\x{2028}\x{2029}]*\)[*+?{]`,
);

/**
 * Outcome of validating and compiling a pattern that comes from a policy file
 * or a policy update.
 *
 * - `invalid`: the pattern is malformed or uses syntax that RE2 does not
 *   support, such as lookaround or backreferences.
 * - `restricted`: the pattern is longer than the length limit or contains a
 *   nested quantifier.
 * - `too_large`: the pattern compiles to more than `MAX_PROGRAM_SIZE`
 *   instructions.
 */
export type ArgsPatternResult =
  | { ok: true; regex: SafeRegExp }
  | { ok: false; reason: 'invalid'; error: string }
  | { ok: false; reason: 'restricted' }
  | { ok: false; reason: 'too_large'; programSize: number };

/**
 * Validates a pattern and compiles it with the linear-time engine.
 *
 * This is the single entry point for pattern text that the CLI did not build
 * itself. It never constructs a native `RegExp` from the pattern.
 */
export function compileArgsPattern(pattern: string): ArgsPatternResult {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, reason: 'restricted' };
  }

  let regex: SafeRegExp;
  try {
    regex = SafeRegExp.compile(pattern);
  } catch (e) {
    return {
      ok: false,
      reason: 'invalid',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (NESTED_QUANTIFIER.test(pattern)) {
    return { ok: false, reason: 'restricted' };
  }

  if (regex.programSize > MAX_PROGRAM_SIZE) {
    return { ok: false, reason: 'too_large', programSize: regex.programSize };
  }

  return { ok: true, regex };
}

/**
 * Returns true if a pattern compiles with the linear-time engine and passes
 * the length limit, the nested-quantifier check, and the compiled size limit.
 */
export function isSafeRegExp(pattern: string): boolean {
  return compileArgsPattern(pattern).ok;
}

/**
 * The whitespace set of JavaScript's `\s`, written for RE2, whose own `\s` is
 * ASCII-only ([\t\n\f\r ]). Command-prefix patterns were designed for the
 * JavaScript engine and treat any of these characters as the end of the
 * prefix, so the set is spelled out to keep them matching the same commands.
 */
const JS_WHITESPACE = String.raw`\s\x0b\x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`;

/**
 * What may follow a command prefix: whitespace, the closing quote of the JSON
 * string, or an escaped quote (\"). A bare backslash is not accepted, because
 * that would let "git\status" match the prefix "git".
 */
export const COMMAND_PREFIX_BOUNDARY = `(?:[${JS_WHITESPACE}"]|\\\\")`;

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

    return prefixes.map((prefix) => {
      // JSON.stringify safely encodes the prefix in quotes.
      // We remove ONLY the trailing quote to match it as an open prefix string.
      const encodedPrefix = JSON.stringify(prefix);
      const openQuotePrefix = encodedPrefix.substring(
        0,
        encodedPrefix.length - 1,
      );

      // Escape the exact JSON literal segment we expect to see
      const matchSegment = escapeRegex(`"command":${openQuotePrefix}`);

      // The prefix must be followed by whitespace, ["], or the specific
      // sequence [\"] (for escaped quotes in JSON). We do NOT allow generic
      // [\\], which would match "git\status" -> "gitstatus".
      return `${matchSegment}${COMMAND_PREFIX_BOUNDARY}`;
    });
  }

  if (commandRegex) {
    return [`"command":"${commandRegex}`];
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
  // We wrap the JSON string in escapeRegex and prepend/append \\0 to explicitly
  // match top-level JSON properties generated by stableStringify, preventing
  // argument injection bypass attacks.
  return `\\\\0${escapeRegex(`"${paramName}":${encodedValue}`)}\\\\0`;
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
