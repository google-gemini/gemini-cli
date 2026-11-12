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
import { debugLogger } from '../utils/debugLogger.js';
import os from 'node:os';

const mockedExec = vi.hoisted(() => vi.fn());
vi.mock('node:util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:util')>();
  return {
    ...actual,
    promisify: vi.fn().mockReturnValue(mockedExec),
  };
});
vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
  },
}));

describe('getIdeProcessInfo', () => {
  let originalPidDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPidDescriptor = Object.getOwnPropertyDescriptor(process, 'pid');
    Object.defineProperty(process, 'pid', { value: 1000, configurable: true });
    mockedExec.mockReset();
    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalPidDescriptor) {
      Object.defineProperty(process, 'pid', originalPidDescriptor);
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('GEMINI_CLI_IDE_PID override', () => {
    it('should use GEMINI_CLI_IDE_PID and fetch command on Unix', async () => {
      (os.platform as Mock).mockReturnValue('linux');
      vi.stubEnv('GEMINI_CLI_IDE_PID', '12345');
      mockedExec.mockResolvedValueOnce({ stdout: '0 my-ide-command' }); // getProcessInfo result

      const result = await getIdeProcessInfo();

      expect(result).toEqual({ pid: 12345, command: 'my-ide-command' });
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining('ps -o ppid=,command= -p 12345'),
        { timeout: 3000 },
      );
    });

    it('should use GEMINI_CLI_IDE_PID and fetch command on Windows via single-PID CIM query', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      vi.stubEnv('GEMINI_CLI_IDE_PID', '54321');
      mockedExec.mockResolvedValueOnce({
        stdout: JSON.stringify({
          ProcessId: 54321,
          ParentProcessId: 0,
          Name: 'Code.exe',
          CommandLine: 'C:\\Program Files\\VSCode\\Code.exe',
        }),
      });

      const result = await getIdeProcessInfo();

      expect(result).toEqual({
        pid: 54321,
        command: 'C:\\Program Files\\VSCode\\Code.exe',
      });
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining(
          "Get-CimInstance Win32_Process -Filter 'ProcessId=54321'",
        ),
        { timeout: 3000 },
      );
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
    });

    it('should handle failure gracefully when single-PID CIM query fails for GEMINI_CLI_IDE_PID on Windows', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      vi.stubEnv('GEMINI_CLI_IDE_PID', '54321');
      mockedExec.mockRejectedValueOnce(new Error('CIM query failed'));

      const result = await getIdeProcessInfo();

      expect(result).toEqual({
        pid: 54321,
        command: '',
      });
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(mockedExec).toHaveBeenCalledWith(
        expect.stringContaining(
          "Get-CimInstance Win32_Process -Filter 'ProcessId=54321'",
        ),
        { timeout: 3000 },
      );
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });
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

    it('should handle timeout when ps command hangs or rejects during getProcessInfo', async () => {
      (os.platform as Mock).mockReturnValue('linux');
      const timeoutError = new Error('exec timeout');
      Object.assign(timeoutError, {
        killed: true,
        code: undefined,
        signal: 'SIGTERM',
      });
      mockedExec.mockRejectedValue(timeoutError);

      const result = await getIdeProcessInfo();

      expect(result).toEqual({ pid: 1000, command: '' });
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
      expect(debugLogger.warn).not.toHaveBeenCalled();
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

    it('should fall back to single-PID PowerShell CIM query and never invoke ps when snapshot fails', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec
        .mockRejectedValueOnce(new Error('PowerShell snapshot timed out'))
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            ProcessId: 1000,
            ParentProcessId: 900,
            Name: 'node.exe',
            CommandLine: 'C:\\Program Files\\nodejs\\node.exe gemini.js',
          }),
        });

      const result = await getIdeProcessInfo();

      expect(result).toEqual({
        pid: 1000,
        command: 'C:\\Program Files\\nodejs\\node.exe gemini.js',
      });
      expect(mockedExec).toHaveBeenCalledTimes(2);
      expect(mockedExec).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          "Get-CimInstance Win32_Process -Filter 'ProcessId=1000'",
        ),
        { timeout: 3000 },
      );
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should fall back to single-PID PowerShell CIM query when snapshot omits current PID', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      const otherProcesses = [
        {
          ProcessId: 2000,
          ParentProcessId: 0,
          Name: 'explorer.exe',
          CommandLine: 'C:\\Windows\\explorer.exe',
        },
      ];
      mockedExec
        .mockResolvedValueOnce({ stdout: JSON.stringify(otherProcesses) })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            ProcessId: 1000,
            ParentProcessId: 900,
            Name: 'node.exe',
            CommandLine: 'node.exe cli.js',
          }),
        });

      const result = await getIdeProcessInfo();

      expect(result).toEqual({ pid: 1000, command: 'node.exe cli.js' });
      expect(mockedExec).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          "Get-CimInstance Win32_Process -Filter 'ProcessId=1000'",
        ),
        { timeout: 3000 },
      );
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should handle PowerShell failure gracefully when both snapshot and CIM fallback fail', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec
        .mockRejectedValueOnce(new Error('PowerShell snapshot failed'))
        .mockRejectedValueOnce(new Error('PowerShell CIM fallback failed'));

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: '' });
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should handle malformed JSON output in snapshot and recover via single-PID CIM fallback', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec
        .mockResolvedValueOnce({ stdout: '{"invalid":json}' })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            ProcessId: 1000,
            ParentProcessId: 0,
            Name: 'node.exe',
            CommandLine: 'node.exe',
          }),
        });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: 'node.exe' });
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should handle empty or null CommandLine output in single-PID CIM fallback gracefully', async () => {
      (os.platform as Mock).mockReturnValue('win32');
      mockedExec.mockResolvedValueOnce({ stdout: '' }).mockResolvedValueOnce({
        stdout: JSON.stringify({
          ProcessId: 1000,
          ParentProcessId: 0,
          Name: 'node.exe',
          CommandLine: null,
        }),
      });

      const result = await getIdeProcessInfo();
      expect(result).toEqual({ pid: 1000, command: '' });
      expect(mockedExec).not.toHaveBeenCalledWith(
        expect.stringContaining('ps '),
        expect.anything(),
      );
      expect(debugLogger.warn).toHaveBeenCalled();
    });

    it('should handle empty stdout, null JSON, array JSON, and malformed JSON in single-PID CIM fallback', async () => {
      (os.platform as Mock).mockReturnValue('win32');

      // Empty stdout on fallback (e.g. process exited)
      mockedExec
        .mockResolvedValueOnce({ stdout: '' })
        .mockResolvedValueOnce({ stdout: '   ' });
      await expect(getIdeProcessInfo()).resolves.toEqual({
        pid: 1000,
        command: '',
      });

      // Literal JSON null on fallback
      mockedExec
        .mockResolvedValueOnce({ stdout: '' })
        .mockResolvedValueOnce({ stdout: 'null' });
      await expect(getIdeProcessInfo()).resolves.toEqual({
        pid: 1000,
        command: '',
      });

      // Array JSON output on fallback
      mockedExec.mockResolvedValueOnce({ stdout: '' }).mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            ProcessId: 1000,
            ParentProcessId: 0,
            Name: 'node.exe',
            CommandLine: 'node.exe --array',
          },
        ]),
      });
      await expect(getIdeProcessInfo()).resolves.toEqual({
        pid: 1000,
        command: 'node.exe --array',
      });

      // Malformed JSON on fallback
      mockedExec
        .mockResolvedValueOnce({ stdout: '' })
        .mockResolvedValueOnce({ stdout: '{bad-json' });
      await expect(getIdeProcessInfo()).resolves.toEqual({
        pid: 1000,
        command: '',
      });
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
