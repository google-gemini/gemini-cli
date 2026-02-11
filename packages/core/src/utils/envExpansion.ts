/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Expands environment variables in a string using the provided environment record.
 * Supports POSIX/Bash syntax ($VAR, ${VAR}) and Windows syntax (%VAR%).
 *
 * @param str - The string containing environment variable placeholders.
 * @param env - A record of environment variable names and their values.
 * @returns The string with environment variables expanded. Missing variables resolve to an empty string.
 */
export function expandEnvVars(
  str: string,
  env: Record<string, string>,
): string {
  if (!str) return str;
  return str.replace(
    /\$(?:(\w+)|{(\w+)})|%(\w+)%/g,
    (_, g1, g2, g3) => env[g1 || g2 || g3] ?? '',
  );
}
