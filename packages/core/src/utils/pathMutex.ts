/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { resolveToRealPath } from './paths.js';

/**
 * Normalizes a lock key for consistent path-based synchronization,
 * resolving symlinks and accounting for case-insensitive filesystems.
 */
function normalizeLockKey(rawKey: string): string {
  let resolved: string;
  try {
    resolved = resolveToRealPath(path.resolve(rawKey));
  } catch {
    resolved = path.resolve(rawKey);
  }
  const platform = os.platform();
  return platform === 'win32' || platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved;
}

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const err = new Error(
    typeof signal.reason === 'string' && signal.reason
      ? signal.reason
      : 'Operation cancelled',
  );
  err.name = 'AbortError';
  return err;
}

interface QueueEntry {
  grant: () => void;
  cancelled: boolean;
}

/**
 * An in-process, per-path FIFO asynchronous mutex with AbortSignal support.
 * Ensures read-modify-write sequences on the same physical path are serialized
 * across concurrent tool invocations and sub-agents without leaving lockfiles
 * in the user's working tree.
 */
export class PathMutex {
  private readonly queues = new Map<string, QueueEntry[]>();

  /**
   * Acquires an exclusive lock for `key`. Returns a release callback.
   * If `signal` aborts while waiting in the queue, rejects immediately and
   * removes the waiter without disrupting downstream waiters.
   */
  async acquire(key: string, signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw createAbortError(signal);
    }

    const normalizedKey = normalizeLockKey(key);
    const existingQueue = this.queues.get(normalizedKey);

    const release = (): void => {
      const queue = this.queues.get(normalizedKey);
      if (!queue) {
        return;
      }
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (!next.cancelled) {
          next.grant();
          return;
        }
      }
      this.queues.delete(normalizedKey);
    };

    if (!existingQueue) {
      this.queues.set(normalizedKey, []);
      return release;
    }

    return new Promise<() => void>((resolve, reject) => {
      let settled = false;
      const entry: QueueEntry = {
        cancelled: false,
        grant: () => {
          if (settled) {
            release();
            return;
          }
          settled = true;
          signal?.removeEventListener('abort', onAbort);
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              release();
            }
          });
        },
      };

      const onAbort = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        entry.cancelled = true;
        signal?.removeEventListener('abort', onAbort);
        reject(createAbortError(signal!));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      existingQueue.push(entry);
    });
  }

  /**
   * Runs `fn` while holding the exclusive lock for `key`.
   */
  async runExclusive<T>(
    key: string,
    fn: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const release = await this.acquire(key, signal);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Exposed for testing that no map entries leak after locks are released.
   */
  get activeLockCount(): number {
    return this.queues.size;
  }
}

const defaultPathMutex = new PathMutex();

/**
 * Executes `fn` exclusively for the given `filePath` across the current process.
 */
export async function withPathLock<T>(
  filePath: string,
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return defaultPathMutex.runExclusive(filePath, fn, signal);
}
