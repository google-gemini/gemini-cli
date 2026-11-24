/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

interface ParsedCommandToken {
  value: string;
  isEnvAssignment: boolean;
}

const POSIX_ENV_VAR_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Tokenizes a command string while respecting single/double quotes and
 * backslash-escaped whitespace, preserving Windows path backslashes.
 */
function tokenizeCommand(input: string): ParsedCommandToken[] {
  const tokens: ParsedCommandToken[] = [];
  let i = 0;

  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i])) {
      i++;
    }
    if (i >= input.length) {
      break;
    }

    let value = '';
    let quote: '"' | "'" | null = null;
    let hasQuoteBeforeEquals = false;
    let sawUnquotedEquals = false;
    let unquotedPrefixBeforeEquals = '';

    while (i < input.length) {
      const ch = input[i];

      if (quote === null) {
        if (/\s/.test(ch)) {
          break;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          if (!sawUnquotedEquals) {
            hasQuoteBeforeEquals = true;
          }
          i++;
          continue;
        }
        if (ch === '\\' && i + 1 < input.length && /\s/.test(input[i + 1])) {
          const escaped = input[i + 1];
          value += escaped;
          if (!sawUnquotedEquals) {
            unquotedPrefixBeforeEquals += escaped;
          }
          i += 2;
          continue;
        }
        if (ch === '=' && !sawUnquotedEquals) {
          sawUnquotedEquals = true;
        } else if (!sawUnquotedEquals) {
          unquotedPrefixBeforeEquals += ch;
        }
        value += ch;
        i++;
      } else if (quote === "'") {
        if (ch === "'") {
          quote = null;
        } else {
          value += ch;
        }
        i++;
      } else {
        if (
          ch === '\\' &&
          i + 1 < input.length &&
          (input[i + 1] === '"' || input[i + 1] === '\\')
        ) {
          value += input[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          quote = null;
        } else {
          value += ch;
        }
        i++;
      }
    }

    const isEnvAssignment =
      sawUnquotedEquals &&
      !hasQuoteBeforeEquals &&
      POSIX_ENV_VAR_NAME_REGEX.test(unquotedPrefixBeforeEquals);

    tokens.push({ value, isEnvAssignment });
  }

  return tokens;
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

  // Tokenize command while preserving quoted env values and paths
  const tokens = tokenizeCommand(hookName.trim());
  if (tokens.length === 0) {
    return 'unknown-command';
  }

  // Skip leading POSIX environment variable assignments (e.g., VAR=value cmd)
  const commandToken = tokens.find((token) => !token.isEnvAssignment);
  const command = commandToken?.value;
  if (!command) {
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

  // If it's a path, extract just the basename
  if (firstSeparatorIndex !== -1) {
    const pathParts = command.split(/[/\\]/);
    const basename = pathParts[pathParts.length - 1];
    if (!basename || basename.includes('=')) {
      return 'unknown-command';
    }
    return basename;
  }

  return command;
}
