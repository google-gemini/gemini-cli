/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parses a SANDBOX_ENV string into a map of environment variables.
 *
 * The input string is a comma-separated list of either:
 * 1. `KEY=VALUE` pairs.
 * 2. `HOST_VAR_NAME` which forwards the variable from the host environment.
 *
 * Heuristic: A comma is treated as a separator ONLY if the next part contains an `=`.
 * This allows values to contain commas (e.g., `VAR1=a,b,VAR2=c`).
 *
 * Note: If a value contains an `=` after a comma, it will be misparsed as a new key.
 * This is a known limitation of the heuristic.
 *
 * @param input - The SANDBOX_ENV string to parse.
 * @param hostEnv - The host environment variables (defaults to process.env).
 * @returns A record of parsed environment variables.
 */
export function parseSandboxEnv(
  input: string | undefined,
  hostEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) {
    return result;
  }

  let currentPair = '';
  const parts = input.split(',');

  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    if (part.includes('=')) {
      // If we have a pending pair, process it first
      if (currentPair) {
        const [key, ...valParts] = currentPair.split('=');
        result[key.trim()] = valParts.join('=').trim();
      }
      currentPair = part;
    } else {
      if (currentPair) {
        // This part is a continuation of the previous value (it has a comma)
        currentPair += ',' + part;
      } else {
        // This is a forwarded host variable
        const val = hostEnv[part];
        if (val !== undefined) {
          result[part] = val;
        }
      }
    }
  }

  // Process the last pair
  if (currentPair) {
    const [key, ...valParts] = currentPair.split('=');
    result[key.trim()] = valParts.join('=').trim();
  }

  return result;
}
