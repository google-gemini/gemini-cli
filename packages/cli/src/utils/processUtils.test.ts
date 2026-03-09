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

  beforeEach(() => {
    _resetRelaunchStateForTesting();
  });

  afterEach(() => vi.clearAllMocks());

  it('should wait for updates, run cleanup, send resume session ID, and exit with the relaunch code', async () => {
    const originalSend = process.send;
    process.send = vi.fn();

    await relaunchApp();
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(process.send).toHaveBeenCalledWith({
      type: 'relaunch-resume-session',
      sessionId: expect.any(String),
    });
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

    process.send = originalSend;
  });

  it('should wait for updates, run cleanup, send override resume session ID, and exit with the relaunch code', async () => {
    const originalSend = process.send;
    process.send = vi.fn();

    await relaunchApp('custom-session-id');
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(process.send).toHaveBeenCalledWith({
      type: 'relaunch-resume-session',
      sessionId: 'custom-session-id',
    });
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);

    process.send = originalSend;
  });
});
