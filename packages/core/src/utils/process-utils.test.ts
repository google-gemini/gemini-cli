/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import os from 'node:os';
import { killProcessGroup, SIGKILL_TIMEOUT_MS } from './process-utils.js';
import { spawnAsync } from './shell-utils.js';

vi.mock('node:os');
vi.mock('./shell-utils.js');

describe('process-utils', () => {
  let mockProcessKill: MockInstance;
  let mockSpawnAsync: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProcessKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    mockSpawnAsync = vi.mocked(spawnAsync);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('killProcessGroup', () => {
    it('should use taskkill on Windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');

      await killProcessGroup({ pid: 1234 });

      expect(mockSpawnAsync).toHaveBeenCalledWith('taskkill', [
        '/pid',
        '1234',
        '/f',
        '/t',
      ]);
      expect(mockProcessKill).not.toHaveBeenCalled();
    });

    it('should use pty.kill() on Windows if pty is provided and also taskkill for descendants', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      expect(mockPty.kill).toHaveBeenCalled();
      // taskkill is also called to reap orphaned descendant processes
      expect(mockSpawnAsync).toHaveBeenCalledWith('taskkill', [
        '/pid',
        '1234',
        '/f',
        '/t',
      ]);
    });

    it('should kill the process group on Unix with SIGKILL by default', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');

      await killProcessGroup({ pid: 1234 });

      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGKILL');
    });
    it('should use escalation on Unix if requested', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      const exited = false;
      const isExited = () => exited;

      const killPromise = killProcessGroup({
        pid: 1234,
        escalate: true,
        isExited,
      });

      // flush microtasks
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      // First call should be SIGTERM
      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGTERM');

      // Advance time
      await vi.advanceTimersByTimeAsync(SIGKILL_TIMEOUT_MS);

      // Second call should be SIGKILL
      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGKILL');

      await killPromise;
    });

    it('should skip SIGKILL if isExited returns true after SIGTERM', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      let exited = false;
      const isExited = vi.fn().mockImplementation(() => exited);

      const killPromise = killProcessGroup({
        pid: 1234,
        escalate: true,
        isExited,
      });

      // flush microtasks
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGTERM');

      // Simulate process exiting
      exited = true;

      await vi.advanceTimersByTimeAsync(SIGKILL_TIMEOUT_MS);

      // Second call should NOT be SIGKILL because it exited
      expect(mockProcessKill).not.toHaveBeenCalledWith(-1234, 'SIGKILL');

      await killPromise;
    });
    it('should fallback to specific process kill if group kill fails', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      mockProcessKill.mockImplementationOnce(() => {
        throw new Error('ESRCH');
      });

      await killProcessGroup({ pid: 1234 });

      // Failed group kill
      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGKILL');
      // Fallback individual kill
      expect(mockProcessKill).toHaveBeenCalledWith(1234, 'SIGKILL');
    });

    it('should use pty fallback on Unix if group kill fails', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      mockProcessKill.mockImplementationOnce(() => {
        throw new Error('ESRCH');
      });
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      expect(mockPty.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('should attempt process group kill on Unix after pty fallback to reap orphaned descendants', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      // First call (group kill) throws to trigger PTY fallback
      mockProcessKill.mockImplementationOnce(() => {
        throw new Error('ESRCH');
      });
      // Second call (group kill retry after pty.kill) should succeed
      mockProcessKill.mockImplementationOnce(() => true);
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      // Group kill should be called first to ensure it's hit before PTY leader dies
      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGKILL');
      // Then PTY kill should be called
      expect(mockPty.kill).toHaveBeenCalledWith('SIGKILL');
    });
  });
});
