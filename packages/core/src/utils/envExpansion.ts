/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expand, type DotenvExpandOutput } from 'dotenv-expand';

/**
 * Expands environment variables in a string using the provided environment record.
 * Uses the standard `dotenv-expand` library to handle expansion consistently with
 * other tools.
 *
 * Supports POSIX/Bash syntax ($VAR, ${VAR}).
 * Note: Windows syntax (%VAR%) is not natively supported by dotenv-expand.
 *
 * @param str - The string containing environment variable placeholders.
 * @param env - A record of environment variable names and their values.
 * @returns The string with environment variables expanded. Missing variables resolve to an empty string.
 */
export function expandEnvVars(
  str: string,
  env: Record<string, string | undefined>,
): string {
  if (!str) return str;

  // 1. Pre-process Windows-style variables (%VAR%) since dotenv-expand only handles POSIX ($VAR).
  // We only do this on Windows to limit the blast radius and avoid conflicts with other
  // systems where % might be a literal character (e.g. in URLs or shell commands).
  const isWindows = process.platform === 'win32';
  const processedStr = isWindows
    ? str.replace(/%(\w+)%/g, (_, name) => env[name] ?? '')
    : str;

  // 2. Use dotenv-expand for POSIX/Bash syntax ($VAR, ${VAR}).
  // dotenv-expand is designed to process an object of key-value pairs (like a .env file).
  // To expand a single string, we wrap it in an object with a temporary key.
  const dummyKey = '__GCLI_EXPAND_TARGET__';

  // Filter out undefined values to satisfy the Record<string, string> requirement safely
  const processEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      processEnv[key] = value;
    }
  }

  const result: DotenvExpandOutput = expand({
    parsed: { [dummyKey]: processedStr },
    processEnv,
  });

  return result.parsed?.[dummyKey] ?? '';
}
