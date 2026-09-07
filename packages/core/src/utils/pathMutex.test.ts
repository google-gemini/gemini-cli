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
    let bothEntered = false;
    let aEntered = false;
    let bEntered = false;

    const a = withPathLock('/tmp/a.txt', async () => {
      aEntered = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (bEntered) bothEntered = true;
    });

    const b = withPathLock('/tmp/b.txt', async () => {
      bEntered = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (aEntered) bothEntered = true;
    });

    await Promise.all([a, b]);

    expect(bothEntered).toBe(true);
  });

  it('returns the value produced by the callback', async () => {
    await expect(withPathLock('/tmp/value.txt', async () => 42)).resolves.toBe(
      42,
    );
  });

  it('releases the lock when a callback rejects', async () => {
    await expect(
      withPathLock('/tmp/throws.txt', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await expect(
      withPathLock('/tmp/throws.txt', async () => 'recovered'),
    ).resolves.toBe('recovered');
  });

  it('does not retain lock state for keys that are no longer in use', async () => {
    await withPathLock('/tmp/transient.txt', async () => undefined);
    expect(pendingPathLockCount()).toBe(0);
  });
});
