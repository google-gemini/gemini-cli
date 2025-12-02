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
 * Creates proxies for process.stdout and process.stderr that use the real write methods
 * (writeToStdout and writeToStderr) bypassing any monkey patching.
 * This is used to write to the real output even when stdio is patched.
 */
export function createWorkingStdio() {
  const inkStdout = new Proxy(process.stdout, {
    get(target, prop, receiver) {
      if (prop === 'write') {
        return writeToStdout;
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });

  const inkStderr = new Proxy(process.stderr, {
    get(target, prop, receiver) {
      if (prop === 'write') {
        return writeToStderr;
      }
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return value.bind(target);
      }
      return value;
    },
  });

  return { stdout: inkStdout, stderr: inkStderr };
}
