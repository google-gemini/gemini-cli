/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { withFileLock } from './fileLocks.js';

describe('withFileLock', () => {
  it('serializes overlapping calls against the same path', async () => {
    // Two tasks acquire the lock for the same path. Each one records its
    // start and end in a shared log. If serialized correctly, B does not
    // start until A has ended.
    const log: string[] = [];
    const taskA = async () => {
      log.push('A:start');
      await delay(20);
      log.push('A:end');
    };
    const taskB = async () => {
      log.push('B:start');
      await delay(5);
      log.push('B:end');
    };

    await Promise.all([
      withFileLock('/tmp/race.txt', taskA),
      withFileLock('/tmp/race.txt', taskB),
    ]);

    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('allows concurrent calls against different paths', async () => {
    // Tasks on different paths must not block each other.
    const log: string[] = [];
    const slow = async () => {
      log.push('slow:start');
      await delay(30);
      log.push('slow:end');
    };
    const fast = async () => {
      log.push('fast:start');
      await delay(1);
      log.push('fast:end');
    };

    await Promise.all([
      withFileLock('/tmp/a.txt', slow),
      withFileLock('/tmp/b.txt', fast),
    ]);

    // The fast task on /tmp/b.txt finishes before the slow task on /tmp/a.txt.
    expect(log).toEqual(['slow:start', 'fast:start', 'fast:end', 'slow:end']);
  });

  it('releases the lock after a thrown error so subsequent calls run', async () => {
    const fail = withFileLock('/tmp/err.txt', async () => {
      throw new Error('boom');
    });
    await expect(fail).rejects.toThrow('boom');

    // Lock should be free; the next call must run.
    const result = await withFileLock('/tmp/err.txt', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('normalises paths so equivalent inputs share the lock', async () => {
    const log: string[] = [];
    const taskA = async () => {
      log.push('A:start');
      await delay(15);
      log.push('A:end');
    };
    const taskB = async () => {
      log.push('B:start');
      log.push('B:end');
    };

    await Promise.all([
      withFileLock('/tmp/dup.txt', taskA),
      withFileLock('/tmp/./dup.txt', taskB),
    ]);

    expect(log).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
