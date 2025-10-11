/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

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

const MAX_OSC52_BASE64 = 99_992; // ~74 kB decoded
const ST = '\u001b\\'; // String Terminator

const hasTty = (): boolean => process.stdout?.isTTY || process.stderr?.isTTY;

const supportsOsc52 = (): boolean => {
  if (!hasTty()) return false;
  const term = (process.env['TERM'] || '').toLowerCase();
  if (term === 'dumb') return false;

  if (
    process.env['TMUX'] ||
    process.env['SSH_TTY'] ||
    process.env['SSH_CONNECTION']
  )
    return true;

  const program = (process.env['TERM_PROGRAM'] || '').toLowerCase();
  const known = [
    'vscode',
    'wezterm',
    'kitty',
    'iterm',
    'alacritty',
    'windows terminal',
    'wt',
  ];
  if (known.some((p) => program.includes(p))) return true;

  if (term.startsWith('xterm') || term.startsWith('screen')) return true;

  return false;
};

const preferOsc52 = (): boolean => {
  if (!supportsOsc52()) return false;

  if (process.env['TMUX']) return true;
  if (process.env['SSH_TTY'] || process.env['SSH_CONNECTION']) return true;
  if ((process.env['TERM_PROGRAM'] || '').toLowerCase() === 'vscode')
    return true;

  const headlessLinux =
    process.platform === 'linux' &&
    !process.env['DISPLAY'] &&
    !process.env['WAYLAND_DISPLAY'] &&
    !process.env['MIR_SOCKET'];
  return headlessLinux;
};

const buildOsc52 = (b64: string): string => {
  const base = `\u001b]52;c;${b64}${ST}`;

  if (process.env['TMUX']) {
    const esc = base.split('\u001b').join('\u001b\u001b');
    return `\u001bPtmux;${esc}${ST}`;
  }

  if ((process.env['TERM'] || '').startsWith('screen')) {
    const esc = base.split('\u001b').join('\u001b\u001b');
    return `\u001bP${esc}${ST}`;
  }

  return base;
};

const writeTo = (stream: NodeJS.WriteStream, data: string) =>
  new Promise<void>((resolve, reject) => {
    stream.write(data, (err) => (err ? reject(err) : resolve()));
  });

const tryOsc52Copy = async (text: string): Promise<void> => {
  if (!supportsOsc52()) throw new Error('OSC 52 unsupported');

  const b64 = Buffer.from(text, 'utf8').toString('base64');
  if (b64.length > MAX_OSC52_BASE64) {
    throw new Error(
      `OSC 52 payload too large (${b64.length} > ${MAX_OSC52_BASE64} bytes)`,
    );
  }

  const seq = buildOsc52(b64);

  const streams: NodeJS.WriteStream[] = [];
  if (process.stderr.isTTY) streams.push(process.stderr);
  if (
    process.stdout.isTTY &&
    (process.stdout as unknown) !== (process.stderr as unknown)
  )
    streams.push(process.stdout);

  for (const s of streams) {
    try {
      await writeTo(s, seq);
      return;
    } catch {
      /* try next target */
    }
  }

  if (process.platform !== 'win32') {
    try {
      await fs.writeFile('/dev/tty', seq, { encoding: 'utf8' });
      return;
    } catch {
      /* ignore */
    }
  }

  throw new Error('No TTY accepted OSC 52 sequence');
};

const runCmd = (
  text: string,
  cmd: string,
  args: string[],
  opts?: SpawnOptions,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = opts ? spawn(cmd, args, opts) : spawn(cmd, args);
    let stderr = '';
    child.stderr?.on('data', (c) => (stderr += c));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited with ${code}: ${stderr.trim()}`)),
    );
    if (child.stdin) {
      child.stdin.on('error', reject);
      child.stdin.write(text);
      child.stdin.end();
    } else {
      reject(new Error(`Child process for '${cmd}' has no stdin stream.`));
    }
  });

const tryNativeClipboard = async (text: string): Promise<void> => {
  const linuxOpts: SpawnOptions = { stdio: ['pipe', 'ignore', 'pipe'] };

  switch (process.platform) {
    case 'win32':
      return runCmd(text, 'clip', []);
    case 'darwin':
      return runCmd(text, 'pbcopy', []);
    case 'linux':
      try {
        await runCmd(text, 'xclip', ['-selection', 'clipboard'], linuxOpts);
      } catch (xclipErr) {
        try {
          await runCmd(text, 'xsel', ['--clipboard', '--input'], linuxOpts);
        } catch (xselErr) {
          const xclipMissing =
            xclipErr instanceof Error &&
            (xclipErr as NodeJS.ErrnoException).code === 'ENOENT';
          const xselMissing =
            xselErr instanceof Error &&
            (xselErr as NodeJS.ErrnoException).code === 'ENOENT';
          if (xclipMissing && xselMissing) {
            throw new Error('xclip/xsel not found');
          }
          const xclipMsg =
            xclipErr instanceof Error ? xclipErr.message : String(xclipErr);
          const xselMsg =
            xselErr instanceof Error ? xselErr.message : String(xselErr);
          throw new Error(`Native clipboard failed: ${xclipMsg}; ${xselMsg}`);
        }
      }
      return;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};

export const copyToClipboard = async (text: string): Promise<void> => {
  const steps: Array<() => Promise<void>> = [];

  if (preferOsc52()) {
    steps.push(
      () => tryOsc52Copy(text),
      () => tryNativeClipboard(text),
    );
  } else {
    steps.push(() => tryNativeClipboard(text));
    if (supportsOsc52()) steps.push(() => tryOsc52Copy(text));
  }

  const errors: Error[] = [];
  for (const step of steps) {
    try {
      await step();
      return;
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  if (errors.length === 1) throw errors[0];
  throw new Error(errors.map((e) => e.message).join(' | '));
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
