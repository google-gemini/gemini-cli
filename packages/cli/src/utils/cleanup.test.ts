/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import { registerCleanup, runExitCleanup } from './cleanup';

describe('cleanup', () => {
  const originalCleanupFunctions = global['cleanupFunctions'];

  beforeEach(() => {
    // Isolate cleanup functions for each test
    global['cleanupFunctions'] = [];
  });

  afterAll(() => {
    // Restore original cleanup functions
    global['cleanupFunctions'] = originalCleanupFunctions;
  });

  it('should run a registered synchronous function', async () => {
    const cleanupFn = vi.fn();
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    registerCleanup(syncFn);
    registerCleanup(asyncFn);

    await runExitCleanup();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn(() => {
      throw new Error('Test Error');
    });
    const successFn = vi.fn();

    registerCleanup(errorFn);
    registerCleanup(successFn);

    await runExitCleanup();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });
});
