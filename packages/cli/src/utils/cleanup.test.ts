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

    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    registerCleanup(cleanupFn);

    await runExitCleanup();

    expect(cleanupFn).toHaveBeenCalledOnce();
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    registerCleanup(syncFn);
    registerCleanup(asyncFn);

    await runExitCleanup();

    expect(syncFn).toHaveBeenCalledOnce();
    expect(asyncFn).toHaveBeenCalledOnce();
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn(() => {
      throw new Error('Test Error');
    });
    const successFn = vi.fn();

    registerCleanup(errorFn);
    registerCleanup(successFn);

    await runExitCleanup();

    expect(errorFn).toHaveBeenCalledOnce();
    expect(successFn).toHaveBeenCalledOnce();
  });
});
