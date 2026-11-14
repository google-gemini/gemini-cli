/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  normalizeError,
  safeSerializeErrorValue,
} from '@google/gemini-cli-core';

export interface FormatErrorOptions {
  debug?: boolean;
  prefix?: string;
}

/**
 * Determines whether CLI debug formatting is enabled via environment variables
 * or CLI arguments (`--debug` / `-d`).
 */
export function isCliDebugEnabled(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (
    [env['DEBUG'], env['DEBUG_MODE']].some((v) => v === 'true' || v === '1')
  ) {
    return true;
  }

  for (const arg of argv) {
    if (arg === '--') {
      break;
    }
    if (
      arg === '--debug' ||
      arg === '-d' ||
      arg === '--debug=true' ||
      arg === '--debug=1'
    ) {
      return true;
    }
  }

  return false;
}

function formatStatusSuffix(
  message: string,
  status: number | string | undefined,
): string {
  const statusText =
    typeof status === 'string'
      ? status.trim()
      : status !== undefined
        ? String(status)
        : '';
  if (!statusText) {
    return '';
  }

  if (message.toLowerCase().includes(statusText.toLowerCase())) {
    return '';
  }

  return ` (Status: ${statusText})`;
}

/**
 * Formats arbitrary CLI errors into a concise, single-line diagnostic string
 * for standard/headless execution, or full stack/structured context when
 * `--debug` is enabled.
 */
export function formatCliError(
  error: unknown,
  options: FormatErrorOptions = {},
): string {
  const normalized = normalizeError(error);
  const prefix = options.prefix ?? 'Error: ';
  const statusSuffix = formatStatusSuffix(
    normalized.message,
    normalized.status,
  );

  if (options.debug) {
    if (error instanceof Error && error.stack) {
      const stackStartsWithError =
        error.stack.startsWith('Error: ') ||
        (error.name.endsWith('Error') &&
          error.stack.startsWith(`${error.name}: `));
      const stackPrefix =
        prefix === 'Error: ' && stackStartsWithError ? '' : prefix;
      let debugOutput =
        error.stack.includes(normalized.message) && !statusSuffix
          ? `${stackPrefix}${error.stack}`
          : `${prefix}${normalized.message}${statusSuffix}\n${error.stack}`;

      if (normalized.details !== undefined) {
        debugOutput += `\nDebug Details: ${safeSerializeErrorValue(normalized.details, 2)}`;
      }
      return debugOutput;
    }

    return `${prefix}${normalized.message}${statusSuffix}\nDebug Context: ${safeSerializeErrorValue(normalized.originalError, 2)}`;
  }

  return `${prefix}${normalized.message}${statusSuffix}`;
}
