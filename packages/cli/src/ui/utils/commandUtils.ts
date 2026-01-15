/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { debugLogger } from '@google/gemini-cli-core';
import clipboardy from 'clipboardy';
import type { SlashCommand } from '../commands/types.js';
import fs from 'node:fs';
import type { Writable } from 'node:stream';

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

const ESC = '\u001B';
const BEL = '\u0007';
const ST = '\u001B\\';

const MAX_OSC52_SEQUENCE_BYTES = 100_000;
const OSC52_HEADER = `${ESC}]52;c;`;
const OSC52_FOOTER = BEL;
const MAX_OSC52_BODY_B64_BYTES =
  MAX_OSC52_SEQUENCE_BYTES -
  Buffer.byteLength(OSC52_HEADER) -
  Buffer.byteLength(OSC52_FOOTER);
const MAX_OSC52_DATA_BYTES = Math.floor(MAX_OSC52_BODY_B64_BYTES / 4) * 3;

// Conservative chunk size for GNU screen DCS passthrough.
const SCREEN_DCS_CHUNK_SIZE = 240;

type TtyTarget = { stream: Writable; closeAfter: boolean } | null;

const pickTty = (): Promise<TtyTarget> =>
  new Promise((resolve) => {
    // /dev/tty is only available on Unix-like systems (Linux, macOS, BSD, etc.)
    if (process.platform !== 'win32') {
      // Prefer the controlling TTY to avoid interleaving escape sequences with piped stdout.
      try {
        const devTty = fs.createWriteStream('/dev/tty');

        // Safety timeout: if /dev/tty doesn't respond quickly, fallback to avoid hanging.
        const timeout = setTimeout(() => {
          // Remove listeners to prevent them from firing after timeout.
          devTty.removeAllListeners('open');
          devTty.removeAllListeners('error');
          devTty.destroy();
          resolve(getStdioTty());
        }, 100);

        // If we can't open it (e.g. sandbox), we'll get an error.
        // We wait for 'open' to confirm it's usable, or 'error' to fallback.
        // If it opens, we resolve with the stream.
        devTty.once('open', () => {
          clearTimeout(timeout);
          devTty.removeAllListeners('error');
          // Prevent future unhandled 'error' events from crashing the process
          devTty.on('error', () => {});
          resolve({ stream: devTty, closeAfter: true });
        });

        // If it errors immediately (or quickly), we fallback.
        devTty.once('error', () => {
          clearTimeout(timeout);
          devTty.removeAllListeners('open');
          resolve(getStdioTty());
        });
        return;
      } catch {
        // fall through - synchronous failure
      }
    }

    resolve(getStdioTty());
  });

const getStdioTty = (): TtyTarget => {
  if (process.stderr?.isTTY)
    return { stream: process.stderr, closeAfter: false };
  if (process.stdout?.isTTY)
    return { stream: process.stdout, closeAfter: false };
  return null;
};

const inTmux = (): boolean =>
  Boolean(
    process.env['TMUX'] || (process.env['TERM'] ?? '').startsWith('tmux'),
  );

const inScreen = (): boolean =>
  Boolean(
    process.env['STY'] || (process.env['TERM'] ?? '').startsWith('screen'),
  );

const isSSH = (): boolean =>
  Boolean(
    process.env['SSH_TTY'] ||
      process.env['SSH_CONNECTION'] ||
      process.env['SSH_CLIENT'],
  );

const isWSL = (): boolean =>
  Boolean(
    process.env['WSL_DISTRO_NAME'] ||
      process.env['WSLENV'] ||
      process.env['WSL_INTEROP'],
  );

const isDumbTerm = (): boolean => (process.env['TERM'] ?? '') === 'dumb';

const shouldUseOsc52 = (tty: TtyTarget): boolean =>
  Boolean(tty) && !isDumbTerm() && (isSSH() || isWSL());

const safeUtf8Truncate = (buf: Buffer, maxBytes: number): Buffer => {
  if (buf.length <= maxBytes) return buf;
  let end = maxBytes;
  // Back up to the start of a UTF-8 code point if we cut through a continuation byte (10xxxxxx).
  while (end > 0 && (buf[end - 1] & 0b1100_0000) === 0b1000_0000) end--;
  return buf.subarray(0, end);
};

const buildOsc52 = (text: string): string => {
  const raw = Buffer.from(text, 'utf8');
  const safe = safeUtf8Truncate(raw, MAX_OSC52_DATA_BYTES);
  const b64 = safe.toString('base64');
  return `${OSC52_HEADER}${b64}${OSC52_FOOTER}`;
};

const wrapForTmux = (seq: string): string => {
  // Double ESC bytes in payload without a control-character regex.
  const doubledEsc = seq.split(ESC).join(ESC + ESC);
  return `${ESC}Ptmux;${doubledEsc}${ST}`;
};

const wrapForScreen = (seq: string): string => {
  let out = '';
  for (let i = 0; i < seq.length; i += SCREEN_DCS_CHUNK_SIZE) {
    out += `${ESC}P${seq.slice(i, i + SCREEN_DCS_CHUNK_SIZE)}${ST}`;
  }
  return out;
};

const writeAll = (stream: Writable, data: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onError = (err: unknown) => {
      cleanup();
      reject(err as Error);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      stream.off('error', onError);
      stream.off('drain', onDrain);
      // Writable.write() handlers may not emit 'drain' if the first write succeeded.
    };
    stream.once('error', onError);
    if (stream.write(data)) {
      cleanup();
      resolve();
    } else {
      stream.once('drain', onDrain);
    }
  });

// Copies a string snippet to the clipboard with robust OSC-52 support.
export const copyToClipboard = async (text: string): Promise<void> => {
  if (!text) return;

  const tty = await pickTty();

  if (shouldUseOsc52(tty)) {
    const osc = buildOsc52(text);
    const payload = inTmux()
      ? wrapForTmux(osc)
      : inScreen()
        ? wrapForScreen(osc)
        : osc;

    await writeAll(tty!.stream, payload);

    if (tty!.closeAfter) {
      (tty!.stream as fs.WriteStream).end();
    }
    return;
  }

  // Local / non-TTY fallback
  await clipboardy.write(text);
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
      debugLogger.warn(
        `Unknown platform: ${process.platform}. Attempting to open URLs with: ${openCmd}.`,
      );
      break;
  }
  return openCmd;
};

/**
 * Determines if a slash command should auto-execute when selected.
 *
 * All built-in commands have autoExecute explicitly set to true or false.
 * Custom commands (.toml files) and extension commands without this flag
 * will default to false (safe default - won't auto-execute).
 *
 * @param command The slash command to check
 * @returns true if the command should auto-execute on Enter
 */
export function isAutoExecutableCommand(
  command: SlashCommand | undefined | null,
): boolean {
  if (!command) {
    return false;
  }

  // Simply return the autoExecute flag value, defaulting to false if undefined
  return command.autoExecute ?? false;
}
