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
  afterEach,
  beforeEach,
  type Mock,
} from 'vitest';
import { getIdeProcessInfo } from './process-utils.js';
import os from 'node:os';

const mockedExec = vi.hoisted(() => vi.fn());
vi.mock('node:util', () => ({
  promisify: vi.fn().mockReturnValue(mockedExec),
}));
vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
  },
}));

describe('getIdeProcessInfo', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'pid', { value: 1000, configurable: true });
    mockedExec.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('on Unix', () => {
    it('should traverse up to find the shell and return grandparent process info', async () => {
      (os.platform as Mock).mockReturnValue('linux');
      // process (1000) -> shell (800) -> IDE (700)
      mockedExec
        .mockResolvedValueOnce({ stdout: '800 /bin/bash' }) // pid 1000 -> ppid 800 (shell)
        .mockResolvedValueOnce({ stdout: '700 /usr/lib/vscode/code' }) // pid 800 -> ppid 700 (IDE)
        .mockResolvedValueOnce({ stdout: '700 /usr/lib/vscode/code' }); // get command for pid 700

      const result = await getIdeProcessInfo();

      expect(result).toEqual({ pid: 700, command: '/usr/lib/vscode/code' });
    });

    it('should return parent process info if grandparent lookup fails', async () => {
      (os.platform as Mock).mockReturnValue('linux');
      mockedExec
        .mockResolvedValueOnce({ stdout: '800 /bin/bash' }) // pid 1000 -> ppid 800 (shell)
        .mockRejectedValueOnce(new Error('ps failed')) // lookup for ppid of 800 fails
        .mockResolvedValueOnce({ stdout: '800 /bin/bash' }); // get command for pid 800

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 800, command: '/bin/bash' });
    });
  });

  describe('on Windows', () => {
    it('should traverse up and find the great-grandchild of the root process', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      // process (1000) -> powershell (900) -> code (800) -> wininit (700) -> root (0)
      // Ancestors: [1000, 900, 800, 700]
      // Target (great-grandchild of root): 900
      const processes = [
        {
          ProcessId: 1000,
          ParentProcessId: 900,
          Name: 'node.exe',
          CommandLine: 'node.exe',
        },
        {
          ProcessId: 900,
          ParentProcessId: 800,
          Name: 'powershell.exe',
          CommandLine: 'powershell.exe',
        },
        {
          ProcessId: 800,
          ParentProcessId: 700,
          Name: 'code.exe',
          CommandLine: 'code.exe',
        },
        {
          ProcessId: 700,
          ParentProcessId: 0,
          Name: 'wininit.exe',
          CommandLine: 'wininit.exe',
        },
      ];
      mockedExec.mockResolvedValueOnce({ stdout: JSON.stringify(processes) });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 900, command: 'powershell.exe' });
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining('Get-CimInstance Win32_Process'),
        expect.anything(),
      );
    });

    it('should handle short process chains', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      // process (1000) -> root (0)
      const processes = [
        {
          ProcessId: 1000,
          ParentProcessId: 0,
          Name: 'node.exe',
          CommandLine: 'node.exe',
        },
      ];
      mockedExec.mockResolvedValueOnce({ stdout: JSON.stringify(processes) });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: 'node.exe' });
    });

    it('should handle PowerShell failure gracefully', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec.mockRejectedValueOnce(new Error('PowerShell failed'));
      // Fallback to getProcessInfo for current PID
      mockedExec.mockResolvedValueOnce({ stdout: '' }); // ps command fails on windows

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: '' });
    });

    it('should handle malformed JSON output gracefully', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec.mockResolvedValueOnce({ stdout: '{"invalid":json}' });
      // Fallback to getProcessInfo for current PID
      mockedExec.mockResolvedValueOnce({ stdout: '' });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: '' });
    });

    it('should handle single process output from ConvertTo-Json', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      const process = {
        ProcessId: 1000,
        ParentProcessId: 0,
        Name: 'node.exe',
        CommandLine: 'node.exe',
      };
      mockedExec.mockResolvedValueOnce({ stdout: JSON.stringify(process) });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: 'node.exe' });
    });

    it('should handle missing process in map during traversal', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      // process (1000) -> parent (900) -> missing (800)
      const processes = [
        {
          ProcessId: 1000,
          ParentProcessId: 900,
          Name: 'node.exe',
          CommandLine: 'node.exe',
        },
        {
          ProcessId: 900,
          ParentProcessId: 800,
          Name: 'parent.exe',
          CommandLine: 'parent.exe',
        },
      ];
      mockedExec.mockResolvedValueOnce({ stdout: JSON.stringify(processes) });

      const result = await getIdeProcessInfo();
      // Ancestors: [1000, 900]. Length < 3, returns last (900)
      expect(result).toEqual({ pid: 900, command: 'parent.exe' });
    });
  });
});
