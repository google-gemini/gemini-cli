/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { registerCleanup, runExitCleanup } from './cleanup.js';

describe('cleanup', () => {
  let register: typeof registerCleanup;
  let runExit: typeof runExitCleanup;

  beforeEach(async () => {
    vi.resetModules();
    const cleanupModule = await import('./cleanup.js');
    register = cleanupModule.registerCleanup;
    runExit = cleanupModule.runExitCleanup;
  });

  it('should run a registered synchronous function', async () => {
    const cleanupFn = vi.fn();
    register(cleanupFn);

    await runExit();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run a registered asynchronous function', async () => {
    const cleanupFn = vi.fn().mockResolvedValue(undefined);
    register(cleanupFn);

    await runExit();

    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });

  it('should run multiple registered functions', async () => {
    const syncFn = vi.fn();
    const asyncFn = vi.fn().mockResolvedValue(undefined);

    register(syncFn);
    register(asyncFn);

    await runExit();

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(asyncFn).toHaveBeenCalledTimes(1);
  });

  it('should continue running cleanup functions even if one throws an error', async () => {
    const errorFn = vi.fn().mockImplementation(() => {
      throw new Error('test error');
    });
    const successFn = vi.fn();
    register(errorFn);
    register(successFn);

    await expect(runExit()).resolves.not.toThrow();

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(successFn).toHaveBeenCalledTimes(1);
  });
});
