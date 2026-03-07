/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import { spawn as cpSpawn, type ChildProcess } from 'node:child_process';
import { killProcessGroup, SIGKILL_TIMEOUT_MS } from './process-utils.js';

vi.mock('node:os');
vi.mock('node:child_process');

describe('process-utils', () => {
  const mockProcessKill = vi
    .spyOn(process, 'kill')
    .mockImplementation(() => true);
  const mockSpawn = vi.mocked(cpSpawn);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('killProcessGroup', () => {
    it('should use taskkill on Windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');

      await killProcessGroup({ pid: 1234 });

      expect(mockSpawn).toHaveBeenCalledWith('taskkill', [
        '/pid',
        '1234',
        '/f',
        '/t',
      ]);
      expect(mockProcessKill).not.toHaveBeenCalled();
    });

    it('should use pty.kill() on Windows if pty is provided without a pid', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      // pty without pid — no taskkill invocation possible
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      expect(mockPty.kill).toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should invoke taskkill with full path on Windows when pty has a pid and SystemRoot is set', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      const mockPty = { kill: vi.fn(), pid: 9999 };
      mockSpawn.mockReturnValue({ on: vi.fn() } as unknown as ChildProcess);

      await killProcessGroup({ pid: 1234, pty: mockPty });

      // Step 1: pty.kill() signals the session leader
      expect(mockPty.kill).toHaveBeenCalled();
      // Step 2: taskkill reaps the full process tree via absolute path
      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\taskkill.exe',
        ['/pid', '9999', '/f', '/t'],
      );
    });

    it('should invoke taskkill from PATH on Windows when pty has a pid and SystemRoot is NOT set', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.stubEnv('SystemRoot', '');
      const mockPty = { kill: vi.fn(), pid: 9999 };
      mockSpawn.mockReturnValue({ on: vi.fn() } as unknown as ChildProcess);

      await killProcessGroup({ pid: 1234, pty: mockPty });

      expect(mockPty.kill).toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith('taskkill', [
        '/pid',
        '9999',
        '/f',
        '/t',
      ]);
    });

    it('should fall back to pty.kill() on Windows if taskkill spawn emits an error', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.stubEnv('SystemRoot', 'C:\\Windows');
      const mockPty = { kill: vi.fn(), pid: 9999 };
      let errorHandler: ((err: Error) => void) | undefined;
      mockSpawn.mockReturnValue({
        on: vi
          .fn()
          .mockImplementation(
            (event: string, handler: (err: Error) => void) => {
              if (event === 'error') errorHandler = handler;
            },
          ),
      } as unknown as ChildProcess);

      await killProcessGroup({ pid: 1234, pty: mockPty });
      // Simulate taskkill spawn failure
      errorHandler?.(new Error('ENOENT'));

      // pty.kill called twice: once for session leader, once in error fallback
      expect(mockPty.kill).toHaveBeenCalledTimes(2);
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

      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGTERM');

      // Simulate process exiting
      exited = true;

      await vi.advanceTimersByTimeAsync(SIGKILL_TIMEOUT_MS);

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

    it('should attempt Unix group SIGKILL after pty fallback to reap orphaned descendants', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      // First call: group kill throws (ESRCH — process group leader exited)
      mockProcessKill.mockImplementationOnce(() => {
        throw new Error('ESRCH');
      });
      // Second call: orphan group reap — will succeed
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      // pty.kill was called for the session leader
      expect(mockPty.kill).toHaveBeenCalledWith('SIGKILL');
      // process.kill(-pid) was also attempted to reap orphaned descendants
      expect(mockProcessKill).toHaveBeenCalledWith(-1234, 'SIGKILL');
    });
  });
});
