/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { pendingPathLockCount, withPathLock } from './pathMutex.js';

describe('withPathLock', () => {
  it('serializes callbacks that target the same key', async () => {
    const events: string[] = [];

    const first = withPathLock('/tmp/same.txt', async () => {
      events.push('first:enter');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('first:exit');
    });

    const second = withPathLock('/tmp/same.txt', async () => {
      events.push('second:enter');
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push('second:exit');
    });

    await Promise.all([first, second]);

    expect(events).toEqual([
      'first:enter',
      'first:exit',
      'second:enter',
      'second:exit',
    ]);
  });

  it('runs callbacks for different keys concurrently', async () => {
    const events: string[] = [];

    const first = withPathLock('/tmp/a.txt', async () => {
      events.push('a:enter');
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push('a:exit');
    });

    const second = withPathLock('/tmp/b.txt', async () => {
      events.push('b:enter');
      await new Promise((resolve) => setTimeout(resolve, 0));
      events.push('b:exit');
    });

    await Promise.all([first, second]);

    // b finishes before a because they do not share a lock.
    expect(events).toEqual(['a:enter', 'b:enter', 'b:exit', 'a:exit']);
  });

  it('does not stall waiting callers if an earlier caller throws', async () => {
    const events: string[] = [];

    const failing = withPathLock('/tmp/throwing.txt', async () => {
      events.push('failing:run');
      throw new Error('boom');
    });

    const succeeding = withPathLock('/tmp/throwing.txt', async () => {
      events.push('succeeding:run');
      return 'ok';
    });

    await expect(failing).rejects.toThrow('boom');
    await expect(succeeding).resolves.toBe('ok');
    expect(events).toEqual(['failing:run', 'succeeding:run']);
  });

  it('cleans up lock state after the last waiter resolves', async () => {
    const key = '/tmp/cleanup.txt';

    const p1 = withPathLock(key, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    const p2 = withPathLock(key, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    expect(pendingPathLockCount()).toBeGreaterThan(0);

    await Promise.all([p1, p2]);

    expect(pendingPathLockCount()).toBe(0);
  });
});
