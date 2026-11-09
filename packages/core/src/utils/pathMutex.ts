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
 * @param signal - Optional abort signal for immediate cancellation while waiting.
 * @returns Whatever `fn` resolves to.
 */
export async function withPathLock<T>(
  key: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new Error('Aborted');
  }

  const previous = chains.get(key) ?? Promise.resolve();

  let resolveLockReleased: () => void = () => {};
  const lockReleased = new Promise<void>((resolve) => {
    resolveLockReleased = resolve;
  });

  chains.set(key, lockReleased);

  const cleanup = () => {
    if (chains.get(key) === lockReleased) {
      chains.delete(key);
    }
  };

  return new Promise<T>((resolve, reject) => {
    let active = true;

    const onAbort = () => {
      if (!active) return;
      active = false;
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      // When the lock holder before us finishes, release our lock for subsequent waiters.
      void previous.then(() => {
        resolveLockReleased();
        cleanup();
      });
      reject(new Error('Aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    void previous.then(async () => {
      if (!active) {
        return;
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      if (signal?.aborted) {
        onAbort();
        return;
      }
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        if (active) {
          active = false;
          resolveLockReleased();
          cleanup();
        }
      }
    });
  });
}

/**
 * Number of paths currently holding lock state. Exposed for tests.
 */
export function pendingPathLockCount(): number {
  return chains.size;
}
