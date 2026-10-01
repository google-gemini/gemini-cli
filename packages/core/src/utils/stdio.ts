/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEvents } from './events.js';

// Capture the original stdout and stderr write methods before any monkey patching occurs.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

/**
 * Writes to the real stdout, bypassing any monkey patching on process.stdout.write.
 */
export function writeToStdout(
  ...args: Parameters<typeof process.stdout.write>
): boolean {
  return originalStdoutWrite(...args);
}

/**
 * Writes to the real stderr, bypassing any monkey patching on process.stderr.write.
 */
export function writeToStderr(
  ...args: Parameters<typeof process.stderr.write>
): boolean {
  return originalStderrWrite(...args);
}

/**
 * Monkey patches process.stdout.write and process.stderr.write to redirect output to the provided logger.
 * This prevents stray output from libraries (or the app itself) from corrupting the UI.
 * Returns a cleanup function that restores the original write methods.
 */
export function patchStdio(): () => void {
  const previousStdoutWrite = process.stdout.write;
  const previousStderrWrite = process.stderr.write;

  process.stdout.write = (
    chunk: Uint8Array | string,
    encodingOrCb?:
      | BufferEncoding
      | ((err?: NodeJS.ErrnoException | null) => void),
    cb?: (err?: NodeJS.ErrnoException | null) => void,
  ) => {
    const encoding =
      typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
    coreEvents.emitOutput(false, chunk, encoding);
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (callback) {
      callback();
    }
    return true;
  };

  process.stderr.write = (
    chunk: Uint8Array | string,
    encodingOrCb?:
      | BufferEncoding
      | ((err?: NodeJS.ErrnoException | null) => void),
    cb?: (err?: NodeJS.ErrnoException | null) => void,
  ) => {
    const encoding =
      typeof encodingOrCb === 'string' ? encodingOrCb : undefined;
    coreEvents.emitOutput(true, chunk, encoding);
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb;
    if (callback) {
      callback();
    }
    return true;
  };

  return () => {
    process.stdout.write = previousStdoutWrite;
    process.stderr.write = previousStderrWrite;
  };
}

/**
 * Type guard to check if a property key exists on an object.
 */
function isKey<T extends object>(
  key: string | symbol | number,
  obj: T,
): key is keyof T {
  return key in obj;
}

// Matches ANSI cursor positioning sequences emitted by Ink at the end of a frame
// (e.g. cursorTo `\x1b[<col>G` or `\x1b[<row>;<col>H`, or cursorLeft `\x1b[D`),
// optionally followed by the synchronized output exit sequence (`\x1b[?2026l`).
const INK_CURSOR_POSITION_END_REGEX =
  // eslint-disable-next-line no-control-regex
  /\x1b\[(?:\d+G|\d+;\d+H|D)(\x1b\[\?2026l)?$/;
const SHOW_CURSOR_SEQ = '\x1b[?25h';
const HIDE_CURSOR_SEQ = '\x1b[?25l';
const EXIT_SYNCHRONIZED_OUTPUT_SEQ = '\x1b[?2026l';

/**
 * Creates proxies for process.stdout and process.stderr that use the real write methods
 * (writeToStdout and writeToStderr) bypassing any monkey patching.
 * This is used to write to the real output even when stdio is patched.
 */
export function createWorkingStdio() {
  let cursorShownForIme = false;

  const workingStdoutWrite = (
    ...args: Parameters<typeof process.stdout.write>
  ): boolean => {
    const [chunk] = args;
    if (process.platform === 'win32' && typeof chunk === 'string') {
      // On Windows, ConPTY (conhost.exe) skips VtEngine::PaintCursor when the
      // cursor is hidden (\x1b[?25l), which prevents Ink's IME cursor movement
      // sequences from being forwarded to the terminal emulator and leaves the
      // IME candidate window anchored at the end of the footer. Keep the cursor
      // visible when Ink positions it for a focused input and hide it again
      // when rendering frames without a focused cursor position.
      if (chunk === HIDE_CURSOR_SEQ) {
        cursorShownForIme = false;
      } else if (chunk === SHOW_CURSOR_SEQ) {
        cursorShownForIme = true;
      } else if (INK_CURSOR_POSITION_END_REGEX.test(chunk)) {
        args[0] = chunk.replace(
          INK_CURSOR_POSITION_END_REGEX,
          (match, syncExit?: string) =>
            syncExit
              ? `${match.slice(0, -syncExit.length)}${SHOW_CURSOR_SEQ}${syncExit}`
              : `${match}${SHOW_CURSOR_SEQ}`,
        );
        cursorShownForIme = true;
      } else if (cursorShownForIme) {
        if (chunk.endsWith(EXIT_SYNCHRONIZED_OUTPUT_SEQ)) {
          args[0] = `${chunk.slice(0, -EXIT_SYNCHRONIZED_OUTPUT_SEQ.length)}${HIDE_CURSOR_SEQ}${EXIT_SYNCHRONIZED_OUTPUT_SEQ}`;
        } else {
          args[0] = `${chunk}${HIDE_CURSOR_SEQ}`;
        }
        cursorShownForIme = false;
      }
    }

    return writeToStdout(...args);
  };

  const stdoutHandler: ProxyHandler<typeof process.stdout> = {
    get(target, prop) {
      if (prop === 'write') {
        return workingStdoutWrite;
      }
      if (isKey(prop, target)) {
        const value = target[prop];
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
      return undefined;
    },
  };
  const inkStdout = new Proxy(process.stdout, stdoutHandler);

  const stderrHandler: ProxyHandler<typeof process.stderr> = {
    get(target, prop) {
      if (prop === 'write') {
        return writeToStderr;
      }
      if (isKey(prop, target)) {
        const value = target[prop];
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
      return undefined;
    },
  };
  const inkStderr = new Proxy(process.stderr, stderrHandler);

  return { stdout: inkStdout, stderr: inkStderr };
}
