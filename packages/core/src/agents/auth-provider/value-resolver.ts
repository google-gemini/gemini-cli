/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { debugLogger } from '../../utils/debugLogger.js';

const execAsync = promisify(exec);

/**
 * Resolves a value that may be an environment variable reference,
 * a shell command, or a literal value.
 *
 * Supported formats:
 * - `$ENV_VAR`: Read from environment variable
 * - `!command`: Execute shell command and use output (trimmed)
 * - Any other string: Use as literal value
 *
 * @param value The value to resolve
 * @returns The resolved value
 * @throws Error if environment variable is not set or command fails
 *
 * @example
 * // Environment variable
 * await resolveAuthValue('$MY_API_KEY') // reads process.env.MY_API_KEY
 *
 * // Shell command
 * await resolveAuthValue('!gcloud auth print-access-token') // executes command
 *
 * // Literal value
 * await resolveAuthValue('sk-12345') // returns 'sk-12345'
 */
export async function resolveAuthValue(value: string): Promise<string> {
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

    try {
      const { stdout } = await execAsync(command, {
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
        windowsHide: true, // Hide console window on Windows
      });
      const trimmed = stdout.trim();
      if (!trimmed) {
        throw new Error(`Command '${command}' returned empty output`);
      }
      return trimmed;
    } catch (error) {
      if (error instanceof Error) {
        // Check for timeout
        if ('killed' in error && error.killed) {
          throw new Error(`Command '${command}' timed out after 30 seconds`);
        }
        // Check for non-zero exit code
        if (
          'code' in error &&
          typeof error.code === 'number' &&
          error.code !== 0
        ) {
          throw new Error(
            `Command '${command}' failed with exit code ${error.code}: ${error.message}`,
          );
        }
        throw new Error(
          `Failed to execute command '${command}': ${error.message}`,
        );
      }
      throw new Error(
        `Failed to execute command '${command}': ${String(error)}`,
      );
    }
  }

  // Literal value - return as-is
  return value;
}

/**
 * Check if a value needs resolution (is an env var or command reference).
 * Useful for validation without actually resolving.
 *
 * @param value The value to check
 * @returns true if the value needs resolution
 */
export function needsResolution(value: string): boolean {
  return value.startsWith('$') || value.startsWith('!');
}

/**
 * Mask a sensitive value for logging purposes.
 * Shows the first and last 2 characters with asterisks in between.
 *
 * @param value The sensitive value to mask
 * @returns The masked value
 */
export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}
