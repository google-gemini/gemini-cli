/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-process, per-path mutex used to serialize read-modify-write sequences
 * against the same file.
 *
 * Parallel tool execution (notably sub-agents) can schedule two writes to the
 * same path concurrently. Without serialization the two sequences interleave
 * and one update is silently lost.
 *
 * Scope: this coordinates callers inside a single process only. It does not
 * guard against a second Gemini CLI process, an editor, or any other program
 * writing the same file; that would require an on-disk lock.
 *
 * Callers are expected to pass an already-resolved absolute path so that two
 * spellings of the same file map to the same lock.
 */
const chains = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` with exclusive access to `key`, relative to other `withPathLock`
 * callers using the same key.
 *
 * @param key - The resolved path (or other identifier) to lock.
 * @param fn - The critical section.
 * @returns Whatever `fn` resolves to.
 */
export async function withPathLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  // The stored chain is deliberately non-rejecting (see below), so waiting for
  // our turn cannot fail just because the previous lock holder threw.
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn);

  // Store a settled-either-way view of our run, so a throwing critical section
  // neither blocks the next waiter nor raises an unhandled rejection.
  const chained = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, chained);

  try {
    return await run;
  } finally {
    // Drop the entry once we are the last waiter, so the map does not grow
    // without bound across a long session.
    if (chains.get(key) === chained) {
      chains.delete(key);
    }
  }
}

/**
 * Number of paths currently holding lock state. Exposed for tests.
 */
export function pendingPathLockCount(): number {
  return chains.size;
}
