/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RELAUNCH_EXIT_CODE,
  relaunchApp,
  _resetRelaunchStateForTesting,
} from './processUtils.js';
import * as cleanup from './cleanup.js';
import * as handleAutoUpdate from './handleAutoUpdate.js';

vi.mock('./handleAutoUpdate.js', () => ({
  waitForUpdateCompletion: vi.fn().mockResolvedValue(undefined),
}));

describe('processUtils', () => {
  const processExit = vi
    .spyOn(process, 'exit')
    .mockReturnValue(undefined as never);
  const runExitCleanup = vi.spyOn(cleanup, 'runExitCleanup');
  const originalSend = process.send;

  beforeEach(() => {
    _resetRelaunchStateForTesting();
    process.send = vi.fn(
      (_msg: unknown, callback?: (err: Error | null) => void) => {
        if (callback) callback(null);
        return true;
      },
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.send = originalSend;
  });

  it('should not send IPC message when no sessionId is provided', async () => {
    await relaunchApp();
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(process.send).not.toHaveBeenCalled();
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });

  it('should send resume session ID via IPC when sessionId is provided', async () => {
    await relaunchApp('custom-session-id');
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(process.send).toHaveBeenCalledWith(
      {
        type: 'relaunch-session',
        sessionId: 'custom-session-id',
      },
      expect.any(Function),
    );
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
  });
});
