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

  it('aborts immediately while queued behind an active lock holder', async () => {
    const key = '/tmp/abort_immediate.txt';
    const events: string[] = [];

    const p1 = withPathLock(key, async () => {
      events.push('p1:start');
      await new Promise((resolve) => setTimeout(resolve, 50));
      events.push('p1:end');
    });

    const controller = new AbortController();
    const start = Date.now();
    const p2 = withPathLock(
      key,
      async () => {
        events.push('p2:run');
      },
      controller.signal,
    );

    setTimeout(() => controller.abort(), 10);

    const p3 = withPathLock(key, async () => {
      events.push('p3:run');
    });

    await expect(p2).rejects.toThrow('Aborted');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(45);

    await p1;
    await p3;

    expect(events).toEqual(['p1:start', 'p1:end', 'p3:run']);
    expect(pendingPathLockCount()).toBe(0);
  });
});
