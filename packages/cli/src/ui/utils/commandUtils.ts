/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';

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
 * It triggers if the query starts with '/' but excludes code comments like '//' and '/*'.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean => {
  if (!query.startsWith('/')) {
    return false;
  }

  // Exclude line comments that start with '//'
  if (query.startsWith('//')) {
    return false;
  }

  // Exclude block comments that start with '/*'
  if (query.startsWith('/*')) {
    return false;
  }

  return true;
};

/**
 * Checks for environment variables that indicate an SSH session or
 * a terminal multiplexer like tmux or screen. In these cases, OSC 52
 * is the preferred method for clipboard access.
 * @returns True if in a remote or multiplexed session, false otherwise.
 */
export const isRemoteOrMultiplexedSession = (): boolean =>
  process.env['SSH_CONNECTION'] !== undefined ||
  process.env['SSH_TTY'] !== undefined ||
  process.env['TMUX'] !== undefined ||
  (process.env['TERM'] !== undefined &&
    process.env['TERM'].startsWith('screen'));

/**
 * Copies text to the clipboard using the OSC 52 escape sequence.
 * This is the preferred method for use in remote terminals (like SSH) or with
 * multiplexers (like tmux) that support it, allowing the local
 * machine's clipboard to be set from a remote session.
 *
 * @param text The text to copy.
 */
export const copyViaOSC52 = (text: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const base64Text = Buffer.from(text).toString('base64');
    // OSC 52 sequence: `\x1b]52;c;BASE64_TEXT\x07`
    // - `\x1b]` is the Operating System Command introducer.
    // - `52` specifies the clipboard operation.
    // - `;c;` designates the system clipboard.
    // - `\x07` is the "bell" character, which terminates the sequence.
    const osc52Sequence = `\x1b]52;c;${base64Text}\x07`;
    process.stdout.write(osc52Sequence, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });

// Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text: string): Promise<void> => {
  // In remote or multiplexed sessions, OSC 52 is the most reliable way
  // to access the user's local (system) clipboard. We prioritize it.
  if (isRemoteOrMultiplexedSession()) {
    return await copyViaOSC52(text);
  }

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
          const xclipNotFound =
            primaryError instanceof Error &&
            (primaryError as NodeJS.ErrnoException).code === 'ENOENT';
          const xselNotFound =
            fallbackError instanceof Error &&
            (fallbackError as NodeJS.ErrnoException).code === 'ENOENT';
          if (xclipNotFound && xselNotFound) {
            throw new Error(
              'Please ensure xclip or xsel is installed and configured.',
            );
          }

          let primaryMsg =
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError);
          if (xclipNotFound) {
            primaryMsg = `xclip not found`;
          }
          let fallbackMsg =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          if (xselNotFound) {
            fallbackMsg = `xsel not found`;
          }

          throw new Error(
            `All copy commands failed. "${primaryMsg}", "${fallbackMsg}". `,
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
