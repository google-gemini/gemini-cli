/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import { spawn as cpSpawn } from 'node:child_process';
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

    it('should use pty.kill() on Windows if pty is provided', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const mockPty = { kill: vi.fn() };

      await killProcessGroup({ pid: 1234, pty: mockPty });

      expect(mockPty.kill).toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
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
  });
});
