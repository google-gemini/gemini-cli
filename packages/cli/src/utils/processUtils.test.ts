/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { RELAUNCH_EXIT_CODE, relaunchApp } from './processUtils.js';
import * as cleanup from './cleanup.js';
import * as handleAutoUpdate from './handleAutoUpdate.js';

vi.mock('./handleAutoUpdate.js', () => ({
  getActiveUpdatePromise: vi.fn(),
}));

describe('processUtils', () => {
  const processExit = vi
    .spyOn(process, 'exit')
    .mockReturnValue(undefined as never);
  const runExitCleanup = vi.spyOn(cleanup, 'runExitCleanup');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run cleanup and exit with the relaunch code', async () => {
    vi.mocked(handleAutoUpdate.getActiveUpdatePromise).mockReturnValue(null);
    await relaunchApp();
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should wait for active update promise if it exists', async () => {
    let promiseResolved = false;
    const updatePromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        promiseResolved = true;
        resolve();
      }, 50);
    });

    vi.mocked(handleAutoUpdate.getActiveUpdatePromise).mockReturnValue(
      updatePromise,
    );

    await relaunchApp();

    expect(promiseResolved).toBe(true);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });
});
