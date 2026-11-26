/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type LexFrame =
  | 'single'
  | 'ansi_c'
  | 'double'
  | 'cmd_sub'
  | 'paren'
  | 'param_sub'
  | 'backtick';

interface FrameStep {
  nextIndex: number;
  text: string;
}

const POSIX_ENV_VAR_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*\+?$/;
const EXPLICIT_PATH_PREFIX_REGEX =
  /^(?:[/\\]|\.\.?[/\\]|~[/\\]|\$|[A-Za-z]:[/\\])/;
const EMBEDDED_ARG_BOUNDARY_REGEX = /\s(?:[-/\\~`$]|\.\.?[/\\]|[A-Za-z]:[/\\])/;
const UNSAFE_BASENAME_CHARS_REGEX = /[=\s"'`;&|<>()${}]/;
const SHELL_OPERATOR_TOKENS = new Set(['&&', '||', '|', '|&', ';', ';;', '&']);

function advanceDoubleQuoteFrame(
  input: string,
  i: number,
  stack: LexFrame[],
): FrameStep {
  const ch = input[i];
  const next = i + 1 < input.length ? input[i + 1] : '';

  if (
    ch === '\\' &&
    (next === '"' || next === '\\' || next === '$' || next === '`')
  ) {
    return { nextIndex: i + 2, text: next };
  }
  if (ch === '$' && next === '(') {
    stack.push('cmd_sub');
    return { nextIndex: i + 2, text: '$(' };
  }
  if (ch === '$' && next === '{') {
    stack.push('param_sub');
    return { nextIndex: i + 2, text: '${' };
  }
  if (ch === '`') {
    stack.push('backtick');
    return { nextIndex: i + 1, text: ch };
  }
  if (ch === '"') {
    stack.pop();
    return { nextIndex: i + 1, text: '' };
  }
  return { nextIndex: i + 1, text: ch };
}

function advanceSubstitutionFrame(
  top: 'cmd_sub' | 'paren' | 'param_sub',
  input: string,
  i: number,
  stack: LexFrame[],
): FrameStep {
  const ch = input[i];
  const next = i + 1 < input.length ? input[i + 1] : '';

  if (ch === '\\' && i + 1 < input.length) {
    return { nextIndex: i + 2, text: ch + next };
  }
  if (ch === '$' && next === "'") {
    stack.push('ansi_c');
    return { nextIndex: i + 2, text: '' };
  }
  if (ch === '$' && next === '(') {
    stack.push('cmd_sub');
    return { nextIndex: i + 2, text: '$(' };
  }
  if (ch === '$' && next === '{') {
    stack.push('param_sub');
    return { nextIndex: i + 2, text: '${' };
  }
  if (ch === "'") {
    stack.push('single');
    return { nextIndex: i + 1, text: '' };
  }
  if (ch === '"') {
    stack.push('double');
    return { nextIndex: i + 1, text: '' };
  }
  if (ch === '`') {
    stack.push('backtick');
    return { nextIndex: i + 1, text: ch };
  }
  if (top === 'param_sub') {
    if (ch === '}') {
      stack.pop();
      return { nextIndex: i + 1, text: ch };
    }
  } else {
    if (ch === '(') {
      stack.push('paren');
      return { nextIndex: i + 1, text: ch };
    }
    if (ch === ')') {
      stack.pop();
      return { nextIndex: i + 1, text: ch };
    }
  }
  return { nextIndex: i + 1, text: ch };
}

function advanceBacktickFrame(
  input: string,
  i: number,
  stack: LexFrame[],
): FrameStep {
  const ch = input[i];
  const next = i + 1 < input.length ? input[i + 1] : '';

  if (
    ch === '\\' &&
    (next === '`' ||
      next === '\\' ||
      next === '$' ||
      next === '"' ||
      next === "'")
  ) {
    return { nextIndex: i + 2, text: next };
  }
  if (ch === '$' && next === "'") {
    stack.push('ansi_c');
    return { nextIndex: i + 2, text: '' };
  }
  if (ch === '$' && next === '(') {
    stack.push('cmd_sub');
    return { nextIndex: i + 2, text: '$(' };
  }
  if (ch === '$' && next === '{') {
    stack.push('param_sub');
    return { nextIndex: i + 2, text: '${' };
  }
  if (ch === "'") {
    stack.push('single');
    return { nextIndex: i + 1, text: '' };
  }
  if (ch === '"') {
    stack.push('double');
    return { nextIndex: i + 1, text: '' };
  }
  if (ch === '`') {
    stack.pop();
    return { nextIndex: i + 1, text: ch };
  }
  return { nextIndex: i + 1, text: ch };
}

function advanceNestedFrame(
  top: LexFrame,
  input: string,
  i: number,
  stack: LexFrame[],
): FrameStep {
  const ch = input[i];

  switch (top) {
    case 'single':
      if (ch === "'") {
        stack.pop();
        return { nextIndex: i + 1, text: '' };
      }
      return { nextIndex: i + 1, text: ch };
    case 'ansi_c':
      if (ch === '\\' && i + 1 < input.length) {
        return { nextIndex: i + 2, text: input[i + 1] };
      }
      if (ch === "'") {
        stack.pop();
        return { nextIndex: i + 1, text: '' };
      }
      return { nextIndex: i + 1, text: ch };
    case 'double':
      return advanceDoubleQuoteFrame(input, i, stack);
    case 'cmd_sub':
    case 'paren':
    case 'param_sub':
      return advanceSubstitutionFrame(top, input, i, stack);
    case 'backtick':
      return advanceBacktickFrame(input, i, stack);
    default:
      return { nextIndex: i + 1, text: ch };
  }
}

/**
 * Extracts the first non-env-assignment command token from a shell command
 * string while respecting single quotes, double quotes, ANSI-C `$'...'` quotes,
 * nested `$(...)`, `${...}`, and backtick substitutions, and POSIX escapes on
 * env assignment values (while preserving Windows path backslashes).
 *
 * Returns `null` if no command token exists or if an unterminated quote or
 * substitution is encountered before the command token completes.
 */
function extractFirstCommandToken(input: string): string | null {
  let i = 0;

  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) {
      i++;
    }
    if (i >= input.length) {
      return null;
    }

    let value = '';
    const stack: LexFrame[] = [];
    let hasQuoteBeforeEquals = false;
    let sawUnquotedEquals = false;
    let isEnvAssignment = false;
    let unquotedPrefixBeforeEquals = '';

    while (i < input.length) {
      const top = stack.length > 0 ? stack[stack.length - 1] : null;
      if (top !== null) {
        const step = advanceNestedFrame(top, input, i, stack);
        value += step.text;
        i = step.nextIndex;
        continue;
      }

      const ch = input[i];
      if (/\s/.test(ch)) {
        break;
      }

      if (ch === '\\') {
        if (isEnvAssignment) {
          if (i + 1 < input.length) {
            value += input[i + 1];
            i += 2;
            continue;
          }
          return null;
        }
        if (i + 1 < input.length && /\s/.test(input[i + 1])) {
          const escaped = input[i + 1];
          value += escaped;
          if (!sawUnquotedEquals) {
            unquotedPrefixBeforeEquals += escaped;
          }
          i += 2;
          continue;
        }
        if (!sawUnquotedEquals) {
          unquotedPrefixBeforeEquals += ch;
        }
        value += ch;
        i++;
        continue;
      }

      const next = i + 1 < input.length ? input[i + 1] : '';
      if (ch === '$' && next === "'") {
        stack.push('ansi_c');
        if (!sawUnquotedEquals) {
          hasQuoteBeforeEquals = true;
        }
        i += 2;
        continue;
      }
      if (ch === '$' && next === '(') {
        stack.push('cmd_sub');
        if (!sawUnquotedEquals) {
          hasQuoteBeforeEquals = true;
        }
        value += '$(';
        i += 2;
        continue;
      }
      if (ch === '$' && next === '{') {
        stack.push('param_sub');
        if (!sawUnquotedEquals) {
          hasQuoteBeforeEquals = true;
        }
        value += '${';
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        stack.push(ch === '"' ? 'double' : 'single');
        if (!sawUnquotedEquals) {
          hasQuoteBeforeEquals = true;
        }
        i++;
        continue;
      }
      if (ch === '`') {
        stack.push('backtick');
        if (!sawUnquotedEquals) {
          hasQuoteBeforeEquals = true;
        }
        value += ch;
        i++;
        continue;
      }

      if (ch === '=' && !sawUnquotedEquals) {
        sawUnquotedEquals = true;
        isEnvAssignment =
          !hasQuoteBeforeEquals &&
          POSIX_ENV_VAR_NAME_REGEX.test(unquotedPrefixBeforeEquals);
      } else if (!sawUnquotedEquals) {
        unquotedPrefixBeforeEquals += ch;
      }
      value += ch;
      i++;
    }

    // Fail closed on unterminated quotes or substitutions
    if (stack.length > 0) {
      return null;
    }

    if (!isEnvAssignment) {
      return value;
    }
  }

  return null;
}

/**
 * Sanitize hook name to remove potentially sensitive information.
 * Extracts the base command name without arguments or full paths.
 *
 * This function protects PII by removing:
 * - Full file paths that may contain usernames
 * - Command arguments that may contain credentials, API keys, tokens
 * - Environment variables with sensitive values
 *
 * Examples:
 * - "/path/to/.gemini/hooks/check-secrets.sh --api-key=abc123" -> "check-secrets.sh"
 * - "python /home/user/script.py --token=xyz" -> "python"
 * - "node index.js" -> "node"
 * - "C:\\Windows\\System32\\cmd.exe /c secret.bat" -> "cmd.exe"
 * - "NODE_ENV=production node index.js" -> "node"
 * - "" or "   " -> "unknown-command"
 *
 * @param hookName Full command string.
 * @returns Sanitized command name.
 */
export function sanitizeHookName(hookName: string): string {
  // Handle empty or whitespace-only strings
  if (!hookName || !hookName.trim()) {
    return 'unknown-command';
  }

  // Extract the first command token after skipping leading POSIX env assignments
  const command = extractFirstCommandToken(hookName.trim());
  if (!command || SHELL_OPERATOR_TOKENS.has(command)) {
    return 'unknown-command';
  }

  // Reject residual quotes or URL schemes
  if (
    command.includes('"') ||
    command.includes("'") ||
    command.includes('://')
  ) {
    return 'unknown-command';
  }

  // Defensively drop tokens that look like key=value assignments before any path separator
  const equalsIndex = command.indexOf('=');
  const firstSeparatorIndex = command.search(/[/\\]/);
  if (
    equalsIndex !== -1 &&
    (firstSeparatorIndex === -1 || equalsIndex < firstSeparatorIndex)
  ) {
    return 'unknown-command';
  }

  // Reject quoted full commands + arguments while still allowing paths with spaces in directories
  if (/\s/.test(command)) {
    if (
      firstSeparatorIndex === -1 ||
      !EXPLICIT_PATH_PREFIX_REGEX.test(command) ||
      EMBEDDED_ARG_BOUNDARY_REGEX.test(command)
    ) {
      return 'unknown-command';
    }
  }

  // Extract basename when command is a path
  const basename =
    firstSeparatorIndex !== -1 ? command.split(/[/\\]/).pop() : command;

  if (!basename || UNSAFE_BASENAME_CHARS_REGEX.test(basename)) {
    return 'unknown-command';
  }

  return basename;
}
