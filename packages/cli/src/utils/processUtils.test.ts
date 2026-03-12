/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import {
  RELAUNCH_EXIT_CODE,
  relaunchApp,
  _resetRelaunchStateForTesting,
} from './processUtils.js';
import * as cleanup from './cleanup.js';
import * as relaunch from './relaunch.js';
import * as handleAutoUpdate from './handleAutoUpdate.js';

vi.mock('./handleAutoUpdate.js', () => ({
  waitForUpdateCompletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./relaunch.js', () => ({
  relaunchAppInChildProcess: vi.fn().mockResolvedValue(undefined),
}));

describe('processUtils', () => {
  const processExit = vi
    .spyOn(process, 'exit')
    .mockReturnValue(undefined as never);
  const runExitCleanup = vi.spyOn(cleanup, 'runExitCleanup');
  const relaunchAppInChildProcess = vi.spyOn(
    relaunch,
    'relaunchAppInChildProcess',
  );

  beforeEach(() => {
    _resetRelaunchStateForTesting();
  });

  afterEach(() => {
    delete process.env['SANDBOX'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (process as any).send;
    vi.clearAllMocks();
  });

  it('should wait for updates, run cleanup, and exit with the relaunch code when a parent wrapper exists', async () => {
    process.env['SANDBOX'] = 'sandbox-exec';
    processExit.mockImplementationOnce(() => {
      throw new Error('PROCESS_EXIT_CALLED');
    });

    await expect(relaunchApp()).rejects.toThrow('PROCESS_EXIT_CALLED');
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(processExit).toHaveBeenCalledWith(RELAUNCH_EXIT_CODE);
    expect(relaunchAppInChildProcess).not.toHaveBeenCalled();
  });

  it('should spawn a child wrapper on demand when no parent wrapper exists', async () => {
    await relaunchApp();
    expect(handleAutoUpdate.waitForUpdateCompletion).toHaveBeenCalledTimes(1);
    expect(runExitCleanup).toHaveBeenCalledTimes(1);
    expect(relaunchAppInChildProcess).toHaveBeenCalledWith([], [], undefined);
    expect(processExit).not.toHaveBeenCalled();
  });
});
