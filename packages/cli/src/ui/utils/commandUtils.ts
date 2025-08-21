/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, SpawnOptions } from 'child_process';

/**
 * Checks if a query string potentially represents an '@' command.
 * It triggers if the query starts with '@' or contains '@' preceded by whitespace
 * and followed by a non-whitespace character.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '@' command, false otherwise.
 */
export const isAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @
  query.startsWith('@') || /\s@/.test(query);

/**
 * Checks if a query string potentially represents an '/' command.
 * It triggers if the query starts with '/'
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean => query.startsWith('/');

// Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text: string): Promise<void> => {
  const run = (cmd: string, args: string[], options?: SpawnOptions) =>
    new Promise<void>((resolve, reject) => {
      const child = options ? spawn(cmd, args, options) : spawn(cmd, args);
      let stderr = '';
      if (child.stderr) {
        child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      }
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const errorMsg = stderr.trim();
        reject(
          new Error(
            `'${cmd}' exited with code ${code}${errorMsg ? `: ${errorMsg}` : ''}`,
          ),
        );
      });
      if (child.stdin) {
        child.stdin.on('error', reject);
        child.stdin.write(text);
        child.stdin.end();
      } else {
        reject(new Error('Child process has no stdin stream to write to.'));
      }
    });

  // Configure stdio for Linux clipboard commands.
  // - stdin: 'pipe' to write the text that needs to be copied.
  // - stdout: 'inherit' since we don't need to capture the command's output on success.
  // - stderr: 'pipe' to capture error messages (e.g., "command not found") for better error handling.
  const linuxOptions: SpawnOptions = { stdio: ['pipe', 'inherit', 'pipe'] };

  switch (process.platform) {
    case 'win32':
      return run('clip', []);
    case 'darwin':
      return run('pbcopy', []);
    case 'linux':
      try {
        await run('xclip', ['-selection', 'clipboard'], linuxOptions);
      } catch (primaryError) {
        try {
          // If xclip fails for any reason, try xsel as a fallback.
          await run('xsel', ['--clipboard', '--input'], linuxOptions);
        } catch (fallbackError) {
          const primaryMsg =
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError);
          const fallbackMsg =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          throw new Error(
            `All copy commands failed. xclip: "${primaryMsg}", xsel: "${fallbackMsg}". Please ensure xclip or xsel is installed and configured.`,
          );
        }
      }
      return;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};

export const getUrlOpenCommand = (): string => {
  // --- Determine the OS-specific command to open URLs ---
  let openCmd: string;
  switch (process.platform) {
    case 'darwin':
      openCmd = 'open';
      break;
    case 'win32':
      openCmd = 'start';
      break;
    case 'linux':
      openCmd = 'xdg-open';
      break;
    default:
      // Default to xdg-open, which appears to be supported for the less popular operating systems.
      openCmd = 'xdg-open';
      console.warn(
        `Unknown platform: ${process.platform}. Attempting to open URLs with: ${openCmd}.`,
      );
      break;
  }
  return openCmd;
};
