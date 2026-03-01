/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { RELAUNCH_EXIT_CODE, relaunchApp } from './processUtils.js';
import * as cleanup from './cleanup.js';
import * as updateEmitter from './updateEventEmitter.js';

describe('processUtils', () => {
  const processExit = vi
    .spyOn(process, 'exit')
    .mockReturnValue(undefined as never);
  const runExitCleanup = vi.spyOn(cleanup, 'runExitCleanup');

  beforeEach(() => {
    vi.clearAllMocks();
    updateEmitter.setUpdateInProgress(false);
  });

  afterEach(() => {
    updateEmitter.setUpdateInProgress(false);
  });

  it('should run cleanup and exit with the relaunch code', async () => {
    await relaunchApp();
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should wait for update completion before relaunching when update is in progress', async () => {
    updateEmitter.setUpdateInProgress(true);
    const promise = relaunchApp();

    // Simulate update finishing
    updateEmitter.updateEventEmitter.emit('update-success', {
      message: 'done',
    });

    await promise;
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should still relaunch after timeout if update never completes', async () => {
    vi.useFakeTimers();
    updateEmitter.setUpdateInProgress(true);

    const promise = relaunchApp();

    // Advance timers past the default timeout to simulate the timeout occurring
    await vi.advanceTimersByTimeAsync(updateEmitter.UPDATE_WAIT_TIMEOUT_MS);
    await promise;

    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
    vi.useRealTimers();
  });

  it('should not wait when no update is in progress', async () => {
    const waitSpy = vi.spyOn(updateEmitter, 'waitForUpdateCompletion');

    await relaunchApp();

    expect(waitSpy).not.toHaveBeenCalled();
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

    waitSpy.mockRestore();
  });
});
