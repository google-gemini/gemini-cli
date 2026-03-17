/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseCommandDetails } from './shell-utils.js';

/**
 * Parses a raw shell string and extracts all individual executable commands.
 * Handles simple commands, pipelines, lists, and subshells.
 *
 * @param shellString The raw shell command string
 * @returns An array of string representing the commands
 */
export function extractCommandsFromAst(shellString: string): string[] {
  if (!shellString || !shellString.trim()) {
    return [];
  }

  const parsed = parseCommandDetails(shellString);
  
  if (!parsed || parsed.hasError) {
    return [];
  }

  return parsed.details.map((detail) => detail.text);
}
