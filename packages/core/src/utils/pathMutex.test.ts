/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import { PathMutex, withPathLock } from './pathMutex.js';

describe('PathMutex', () => {
  it('serializes concurrent tasks for the same path in FIFO order', async () => {
    const mutex = new PathMutex();
    const events: string[] = [];

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const task1 = mutex.runExclusive('/tmp/shared-file.txt', async () => {
      events.push('task1:start');
      await firstGate;
      events.push('task1:end');
      return 1;
    });

    const task2 = mutex.runExclusive('/tmp/shared-file.txt', async () => {
      events.push('task2:start');
      events.push('task2:end');
      return 2;
    });

    const task3 = mutex.runExclusive('/tmp/shared-file.txt', async () => {
      events.push('task3:start');
      events.push('task3:end');
      return 3;
    });

    // Give microtasks a turn to ensure task2 and task3 are queued behind task1
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['task1:start']);

    releaseFirst();
    const results = await Promise.all([task1, task2, task3]);

    expect(results).toEqual([1, 2, 3]);
    expect(events).toEqual([
      'task1:start',
      'task1:end',
      'task2:start',
      'task2:end',
      'task3:start',
      'task3:end',
    ]);
    expect(mutex.activeLockCount).toBe(0);
  });

  it('runs tasks for distinct paths in parallel without blocking', async () => {
    const mutex = new PathMutex();
    const events: string[] = [];

    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const taskA = mutex.runExclusive('/tmp/file-a.txt', async () => {
      events.push('A:start');
      await gateA;
      events.push('A:end');
    });

    const taskB = mutex.runExclusive('/tmp/file-b.txt', async () => {
      events.push('B:start');
      events.push('B:end');
    });

    await taskB;
    expect(events).toEqual(['A:start', 'B:start', 'B:end']);

    releaseA();
    await taskA;
    expect(events).toEqual(['A:start', 'B:start', 'B:end', 'A:end']);
    expect(mutex.activeLockCount).toBe(0);
  });

  it('normalizes relative and non-canonical path spellings to the same lock', async () => {
    const mutex = new PathMutex();
    const order: number[] = [];
    const target = path.resolve('/tmp/dir/target.txt');
    const nonCanonical = '/tmp/dir/../dir/target.txt';

    let unblockFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblockFirst = resolve;
    });

    const p1 = mutex.runExclusive(target, async () => {
      order.push(1);
      await gate;
      order.push(2);
    });

    const p2 = mutex.runExclusive(nonCanonical, async () => {
      order.push(3);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(order).toEqual([1]);

    unblockFirst();
    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2, 3]);
    expect(mutex.activeLockCount).toBe(0);
  });

  it('releases the lock and allows subsequent waiters when a task throws', async () => {
    const mutex = new PathMutex();

    await expect(
      mutex.runExclusive('/tmp/fail.txt', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const nextResult = await mutex.runExclusive(
      '/tmp/fail.txt',
      async () => 'recovered',
    );
    expect(nextResult).toBe('recovered');
    expect(mutex.activeLockCount).toBe(0);
  });

  it('rejects immediately if AbortSignal is already aborted', async () => {
    const mutex = new PathMutex();
    const controller = new AbortController();
    controller.abort(new Error('Already aborted'));

    await expect(
      mutex.runExclusive(
        '/tmp/aborted.txt',
        async () => 'nope',
        controller.signal,
      ),
    ).rejects.toThrow('Already aborted');
    expect(mutex.activeLockCount).toBe(0);
  });

  it('cancels a queued waiter on AbortSignal without breaking downstream waiters', async () => {
    const mutex = new PathMutex();
    const events: string[] = [];

    let releaseHolder!: () => void;
    const holderGate = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });

    const holder = mutex.runExclusive('/tmp/contended.txt', async () => {
      events.push('holder:start');
      await holderGate;
      events.push('holder:end');
    });

    const abortController = new AbortController();
    const waiter2 = mutex.runExclusive(
      '/tmp/contended.txt',
      async () => {
        events.push('waiter2:ran');
      },
      abortController.signal,
    );

    const waiter3 = mutex.runExclusive('/tmp/contended.txt', async () => {
      events.push('waiter3:ran');
    });

    // Abort waiter2 while holder still holds the lock
    abortController.abort(new Error('Waiter 2 timed out'));
    await expect(waiter2).rejects.toThrow('Waiter 2 timed out');

    releaseHolder();
    await Promise.all([holder, waiter3]);

    expect(events).toEqual(['holder:start', 'holder:end', 'waiter3:ran']);
    expect(mutex.activeLockCount).toBe(0);
  });

  it('withPathLock helper serializes tasks on the default singleton', async () => {
    const trace: number[] = [];
    await Promise.all([
      withPathLock('/tmp/singleton-test.txt', async () => {
        trace.push(1);
        await new Promise((r) => setTimeout(r, 15));
        trace.push(2);
      }),
      withPathLock('/tmp/singleton-test.txt', async () => {
        trace.push(3);
      }),
    ]);
    expect(trace).toEqual([1, 2, 3]);
  });
});
