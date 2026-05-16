/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';

/**
 * Per-path mutex used to serialize read-modify-write sequences against the
 * same file. The Scheduler can dispatch multiple tool calls in parallel via
 * `Promise.all`, so without this guard two concurrent edits of the same path
 * can race and silently clobber each other (see issue #26731):
 *
 *   1. Op A reads "X"
 *   2. Op B reads "X"
 *   3. Op A writes "X+A"
 *   4. Op B writes "X+B"
 *   → Op A's changes are lost.
 *
 * Calls against *different* paths still run concurrently.
 */
const fileLocks = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` while holding an exclusive lock on `absolutePath`. Concurrent
 * callers with the same path are queued and run sequentially in arrival
 * order. Errors thrown by `fn` propagate to the caller and release the lock.
 */
export async function withFileLock<T>(
  absolutePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = normalizeKey(absolutePath);
  const previous = fileLocks.get(key) ?? Promise.resolve();

  // Build the next link in the chain. We swallow the previous result/error
  // when awaiting it so a failed earlier op doesn't poison later ones.
  const next = previous.then(
    () => fn(),
    () => fn(),
  );

  fileLocks.set(key, next);

  try {
    return await next;
  } finally {
    // Drop the entry once we're the tail of the chain to prevent the map
    // from growing unboundedly. We compare by reference to avoid clobbering
    // a later registration.
    if (fileLocks.get(key) === next) {
      fileLocks.delete(key);
    }
  }
}

/**
 * Normalises a filesystem path for use as a mutex key. Two paths that
 * resolve to the same file should produce the same key.
 */
function normalizeKey(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
