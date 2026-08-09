/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '../../utils/debugLogger.js';
import { getShellConfiguration, spawnAsync } from '../../utils/shell-utils.js';

const COMMAND_TIMEOUT_MS = 60_000;

/**
 * Resolves a value that may be an environment variable reference,
 * a shell command, or a literal value.
 *
 * Supported formats:
 * - `$ENV_VAR`: Read from environment variable
 * - `!command`: Execute shell command and use output (trimmed)
 * - `$$` or `!!`: Escape prefix, returns rest as literal
 * - Any other string: Use as literal value
 *
 * @param value The value to resolve
 * @returns The resolved value
 * @throws Error if environment variable is not set or command fails
 */
export async function resolveAuthValue(value: string): Promise<string> {
  // Support escaping with double prefix (e.g. $$ or !!).
  // Strips one prefix char: $$FOO → $FOO, !!cmd → !cmd (literal, not resolved).
  if (value.startsWith('$$') || value.startsWith('!!')) {
    return value.slice(1);
  }

  // Environment variable: $MY_VAR
  if (value.startsWith('$')) {
    const envVar = value.slice(1);
    const resolved = process.env[envVar];
    if (resolved === undefined || resolved === '') {
      throw new Error(
        `Environment variable '${envVar}' is not set or is empty. ` +
          `Please set it before using this agent.`,
      );
    }
    debugLogger.debug(`[AuthValueResolver] Resolved env var: ${envVar}`);
    return resolved;
  }

  // Shell command: !command arg1 arg2
  if (value.startsWith('!')) {
    const command = value.slice(1).trim();
    if (!command) {
      throw new Error('Empty command in auth value. Expected format: !command');
    }

    debugLogger.debug(`[AuthValueResolver] Executing command for auth value`);

    const shellConfig = getShellConfiguration();
    try {
      const { stdout } = await spawnAsync(
        shellConfig.executable,
        [...shellConfig.argsPrefix, command],
        {
          signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
          windowsHide: true,
        },
      );

      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error(`Command '${command}' returned empty output`);
      }
      return trimmed;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Command '${command}' timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds`,
        );
      }
      throw error;
    }
  }

  // Literal value - return as-is
  return value;
}

/**
 * Check if a value needs resolution (is an env var or command reference).
 */
export function needsResolution(value: string): boolean {
  return value.startsWith('$') || value.startsWith('!');
}

/**
 * Mask a sensitive value for logging purposes.
 * Shows the first and last 2 characters with asterisks in between.
 */
export function maskSensitiveValue(value: string): string {
  if (value.length <= 12) {
    return '****';
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
