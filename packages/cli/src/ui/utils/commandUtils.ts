/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';

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

//Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text: string): Promise<void> => {
  const run = (cmd: string, args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args);
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
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
      child.stdin.on('error', reject);
      child.stdin.write(text);
      child.stdin.end();
    });

  switch (process.platform) {
    case 'win32':
      return run('clip', []);
    case 'darwin':
      return run('pbcopy', []);
    case 'linux':
      try {
        await run('xclip', ['-selection', 'clipboard']);
      } catch (primaryError) {
        try {
          // If xclip fails for any reason, try xsel as a fallback.
          await run('xsel', ['--clipboard', '--input']);
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
