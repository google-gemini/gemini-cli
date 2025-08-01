/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
const mockSpawn = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import EventEmitter from 'events';
import { Readable } from 'stream';
import { type ChildProcess } from 'child_process';
import {
  ShellExecutionService,
  ShellOutputEvent,
} from './shellExecutionService.js';

const mockIsBinary = vi.hoisted(() => vi.fn());
vi.mock('../utils/textUtils.js', () => ({
  isBinary: mockIsBinary,
}));

const mockPlatform = vi.hoisted(() => vi.fn());
vi.mock('os', () => ({
  default: {
    platform: mockPlatform,
  },
  platform: mockPlatform,
}));

const mockProcessKill = vi
  .spyOn(process, 'kill')
  .mockImplementation(() => true);

describe('ShellExecutionService', () => {
  let mockChildProcess: EventEmitter & Partial<ChildProcess>;
  let onOutputEventMock: Mock<(event: ShellOutputEvent) => void>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIsBinary.mockReturnValue(false);
    mockPlatform.mockReturnValue('linux');

    onOutputEventMock = vi.fn();

    mockChildProcess = new EventEmitter() as EventEmitter &
      Partial<ChildProcess>;
    // FIX: Cast simple EventEmitters to the expected stream type.
    mockChildProcess.stdout = new EventEmitter() as Readable;
    mockChildProcess.stderr = new EventEmitter() as Readable;
    mockChildProcess.kill = vi.fn();

    // FIX: Use Object.defineProperty to set the readonly 'pid' property.
    Object.defineProperty(mockChildProcess, 'pid', {
      value: 12345,
      configurable: true,
    });

    mockSpawn.mockReturnValue(mockChildProcess);
  });

  // Helper function to run a standard execution simulation
  const simulateExecution = async (
    command: string,
    simulation: (cp: typeof mockChildProcess, ac: AbortController) => void,
  ) => {
    const abortController = new AbortController();
    const handle = ShellExecutionService.execute(
      command,
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
    );

    await new Promise((resolve) => setImmediate(resolve));
    simulation(mockChildProcess, abortController);
    const result = await handle.result;
    return { result, handle, abortController };
  };

  describe('Successful Execution', () => {
    it('should execute a command and capture stdout and stderr', async () => {
      const { result, handle } = await simulateExecution('ls -l', (cp) => {
        cp.stdout?.emit('data', Buffer.from('file1.txt\n'));
        cp.stderr?.emit('data', Buffer.from('a warning'));
        cp.emit('exit', 0, null);
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'ls -l',
        [],
        expect.objectContaining({ shell: 'bash' }),
      );
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.error).toBeNull();
      expect(result.aborted).toBe(false);
      expect(result.stdout).toBe('file1.txt\n');
      expect(result.stderr).toBe('a warning');
      expect(result.output).toBe('file1.txt\n\na warning');
      expect(handle.pid).toBe(12345);

      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        stream: 'stdout',
        chunk: 'file1.txt\n',
      });
      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        stream: 'stderr',
        chunk: 'a warning',
      });
    });

    it('should strip ANSI codes from output', async () => {
      const { result } = await simulateExecution('ls --color=auto', (cp) => {
        cp.stdout?.emit('data', Buffer.from('a\u001b[31mred\u001b[0mword'));
        cp.emit('exit', 0, null);
      });

      expect(result.stdout).toBe('aredword');
      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        stream: 'stdout',
        chunk: 'aredword',
      });
    });

    it('should correctly decode multi-byte characters split across chunks', async () => {
      const { result } = await simulateExecution('echo "你好"', (cp) => {
        const multiByteChar = Buffer.from('你好', 'utf-8');
        cp.stdout?.emit('data', multiByteChar.slice(0, 2));
        cp.stdout?.emit('data', multiByteChar.slice(2));
        cp.emit('exit', 0, null);
      });
      expect(result.stdout).toBe('你好');
    });

    it('should handle commands with no output', async () => {
      const { result } = await simulateExecution('touch file', (cp) => {
        cp.emit('exit', 0, null);
      });

      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(result.output).toBe('');
      expect(onOutputEventMock).not.toHaveBeenCalled();
    });
  });

  describe('Failed Execution', () => {
    it('should capture a non-zero exit code and format output correctly', async () => {
      const { result } = await simulateExecution('a-bad-command', (cp) => {
        cp.stderr?.emit('data', Buffer.from('command not found'));
        cp.emit('exit', 127, null);
      });

      expect(result.exitCode).toBe(127);
      expect(result.stderr).toBe('command not found');
      expect(result.stdout).toBe('');
      expect(result.output).toBe('\ncommand not found');
      expect(result.error).toBeNull();
    });

    it('should capture a termination signal', async () => {
      const { result } = await simulateExecution('long-process', (cp) => {
        cp.emit('exit', null, 'SIGTERM');
      });

      expect(result.exitCode).toBeNull();
      expect(result.signal).toBe('SIGTERM');
    });

    it('should handle a spawn error', async () => {
      const spawnError = new Error('spawn EACCES');
      const { result } = await simulateExecution('protected-cmd', (cp) => {
        cp.emit('error', spawnError);
        cp.emit('exit', 1, null);
      });

      expect(result.error).toBe(spawnError);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('Aborting Commands', () => {
    describe.each([
      {
        platform: 'linux',
        expectedSignal: 'SIGTERM',
        expectedExit: { signal: 'SIGKILL' as const },
      },
      {
        platform: 'win32',
        expectedCommand: 'taskkill',
        expectedExit: { code: 1 },
      },
    ])(
      'on $platform',
      ({ platform, expectedSignal, expectedCommand, expectedExit }) => {
        it('should abort a running process and set the aborted flag', async () => {
          mockPlatform.mockReturnValue(platform);

          const { result } = await simulateExecution(
            'sleep 10',
            (cp, abortController) => {
              abortController.abort();
              if (expectedExit.signal)
                cp.emit('exit', null, expectedExit.signal);
              if (typeof expectedExit.code === 'number')
                cp.emit('exit', expectedExit.code, null);
            },
          );

          expect(result.aborted).toBe(true);

          if (platform === 'linux') {
            expect(mockProcessKill).toHaveBeenCalledWith(
              -mockChildProcess.pid!,
              expectedSignal,
            );
          } else {
            expect(mockSpawn).toHaveBeenCalledWith(expectedCommand, [
              '/pid',
              String(mockChildProcess.pid),
              '/f',
              '/t',
            ]);
          }
        });
      },
    );

    it('should gracefully attempt SIGKILL on linux if SIGTERM fails', async () => {
      mockPlatform.mockReturnValue('linux');
      vi.useFakeTimers();

      // Don't await the result inside the simulation block for this specific test.
      // We need to control the timeline manually.
      const abortController = new AbortController();
      const handle = ShellExecutionService.execute(
        'unresponsive_process',
        '/test/dir',
        onOutputEventMock,
        abortController.signal,
      );

      abortController.abort();

      // Check the first kill signal
      expect(mockProcessKill).toHaveBeenCalledWith(
        -mockChildProcess.pid!,
        'SIGTERM',
      );

      // Now, advance time past the timeout
      await vi.advanceTimersByTimeAsync(250);

      // Check the second kill signal
      expect(mockProcessKill).toHaveBeenCalledWith(
        -mockChildProcess.pid!,
        'SIGKILL',
      );

      // Finally, simulate the process exiting and await the result
      mockChildProcess.emit('exit', null, 'SIGKILL');
      const result = await handle.result;

      vi.useRealTimers();

      expect(result.aborted).toBe(true);
      expect(result.signal).toBe('SIGKILL');
      // The individual kill calls were already asserted above.
      expect(mockProcessKill).toHaveBeenCalledTimes(2);
    });
  });

  describe('Binary Output', () => {
    it('should detect binary output and switch to progress events', async () => {
      mockIsBinary.mockReturnValueOnce(true);
      const binaryChunk1 = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const binaryChunk2 = Buffer.from([0x0d, 0x0a, 0x1a, 0x0a]);

      const { result } = await simulateExecution('cat image.png', (cp) => {
        cp.stdout?.emit('data', binaryChunk1);
        cp.stdout?.emit('data', binaryChunk2);
        cp.emit('exit', 0, null);
      });

      expect(result.rawOutput).toEqual(
        Buffer.concat([binaryChunk1, binaryChunk2]),
      );
      expect(onOutputEventMock).toHaveBeenCalledTimes(3);
      expect(onOutputEventMock.mock.calls[0][0]).toEqual({
        type: 'binary_detected',
      });
      expect(onOutputEventMock.mock.calls[1][0]).toEqual({
        type: 'binary_progress',
        bytesReceived: 4,
      });
      expect(onOutputEventMock.mock.calls[2][0]).toEqual({
        type: 'binary_progress',
        bytesReceived: 8,
      });
    });

    it('should not emit data events after binary is detected', async () => {
      mockIsBinary.mockImplementation((buffer) => buffer.includes(0x00));

      await simulateExecution('cat mixed_file', (cp) => {
        cp.stdout?.emit('data', Buffer.from('some text'));
        cp.stdout?.emit('data', Buffer.from([0x00, 0x01, 0x02]));
        cp.stdout?.emit('data', Buffer.from('more text'));
        cp.emit('exit', 0, null);
      });

      // FIX: Provide explicit type for the 'call' parameter in the map function.
      const eventTypes = onOutputEventMock.mock.calls.map(
        (call: [ShellOutputEvent]) => call[0].type,
      );
      expect(eventTypes).toEqual([
        'data',
        'binary_detected',
        'binary_progress',
        'binary_progress',
      ]);
    });
  });

  describe('Platform-Specific Behavior', () => {
    it('should use cmd.exe on Windows', async () => {
      mockPlatform.mockReturnValue('win32');
      await simulateExecution('dir "foo bar"', (cp) =>
        cp.emit('exit', 0, null),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'dir "foo bar"',
        [],
        expect.objectContaining({
          shell: true,
          detached: false,
        }),
      );
    });

    it('should use bash and detached process group on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      await simulateExecution('ls "foo bar"', (cp) => cp.emit('exit', 0, null));

      expect(mockSpawn).toHaveBeenCalledWith(
        'ls "foo bar"',
        [],
        expect.objectContaining({
          shell: 'bash',
          detached: true,
        }),
      );
    });
  });
});
