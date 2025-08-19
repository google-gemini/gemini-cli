/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec, ExecException } from 'child_process';
import os from 'os';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { getIdeProcessId } from './process-utils.js';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    platform: vi.fn(),
  };
});

const mockedExec = vi.mocked(exec);
const mockedOsPlatform = vi.mocked(os.platform);

describe('getIdeProcessId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('on darwin/linux', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('darwin');
      Object.defineProperty(process, 'pid', { value: 100 });
    });

    it('should return parent pid of a known shell', async () => {
      // process(100) -> parent(200) -> shell(300) -> grandparent(400)
      mockedExec.mockImplementation((command, callback) => {
        let stdout = '';
        if (command.includes('100')) {
          stdout = '200 /path/to/parent';
        } else if (command.includes('200')) {
          stdout = '300 /bin/zsh';
        }
        (
          callback as (
            error: ExecException | null,
            stdout: string,
            stderr: string,
          ) => void
        )(null, stdout, '');
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(300);
    });

    it('should return top-level ancestor if no shell is found', async () => {
      // process(100) -> parent(200) -> grandparent(300) -> root(1)
      mockedExec.mockImplementation((command, callback) => {
        let stdout = '';
        if (command.includes('100')) {
          stdout = '200 /path/to/parent';
        } else if (command.includes('200')) {
          stdout = '300 /path/to/grandparent';
        } else if (command.includes('300')) {
          stdout = '1 /sbin/launchd';
        }
        (
          callback as (
            error: ExecException | null,
            stdout: string,
            stderr: string,
          ) => void
        )(null, stdout, '');
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(300);
    });

    it('should stop and return last valid pid on exec error', async () => {
      // process(100) -> parent(200) -> ERROR
      mockedExec.mockImplementation((command, callback) => {
        const cb = callback as (
          error: ExecException | null,
          stdout: string,
          stderr: string,
        ) => void;
        if (command.includes('100')) {
          cb(null, '200 /path/to/parent', '');
        } else if (command.includes('200')) {
          cb(new Error('exec failed'), '', '');
        }
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(200);
    });
  });

  describe('on windows', () => {
    beforeEach(() => {
      mockedOsPlatform.mockReturnValue('win32');
      Object.defineProperty(process, 'pid', { value: 1000 });
    });

    it('should return parent pid of a known shell', async () => {
      // process(1000) -> parent(2000) -> shell(3000) -> grandparent(4000)
      mockedExec.mockImplementation((command, callback) => {
        let stdout = '';
        if (command.includes('1000')) {
          stdout = 'Name=parent.exe\r\nParentProcessId=2000\r\n';
        } else if (command.includes('2000')) {
          stdout = 'Name=powershell.exe\r\nParentProcessId=3000\r\n';
        }
        (
          callback as (
            error: ExecException | null,
            stdout: string,
            stderr: string,
          ) => void
        )(null, stdout, '');
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(3000);
    });

    it('should return top-level ancestor if no shell is found', async () => {
      // process(1000) -> parent(2000) -> grandparent(3000) -> root(0)
      mockedExec.mockImplementation((command, callback) => {
        let stdout = '';
        if (command.includes('1000')) {
          stdout = 'Name=parent.exe\r\nParentProcessId=2000\r\n';
        } else if (command.includes('2000')) {
          stdout = 'Name=grandparent.exe\r\nParentProcessId=3000\r\n';
        } else if (command.includes('3000')) {
          stdout = 'Name=System Idle Process\r\nParentProcessId=0\r\n';
        }
        (
          callback as (
            error: ExecException | null,
            stdout: string,
            stderr: string,
          ) => void
        )(null, stdout, '');
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(3000);
    });

    it('should stop and return last valid pid on exec error', async () => {
      // process(1000) -> parent(2000) -> ERROR
      mockedExec.mockImplementation((command, callback) => {
        const cb = callback as (
          error: ExecException | null,
          stdout: string,
          stderr: string,
        ) => void;
        if (command.includes('1000')) {
          cb(null, 'Name=parent.exe\r\nParentProcessId=2000\r\n', '');
        } else if (command.includes('2000')) {
          cb(new Error('exec failed'), '', '');
        }
        return {} as ReturnType<typeof exec>;
      });

      const pid = await getIdeProcessId();
      expect(pid).toBe(2000);
    });
  });

  describe('on unsupported os', () => {
    it('should return the current pid', async () => {
      mockedOsPlatform.mockReturnValue('aix');
      Object.defineProperty(process, 'pid', { value: 500 });
      const pid = await getIdeProcessId();
      expect(pid).toBe(500);
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });
});
