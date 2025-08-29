/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import EventEmitter from 'node:events';
import type { Readable } from 'node:stream';
import { type ChildProcess } from 'node:child_process';
import type { ShellOutputEvent } from './shellExecutionService.js';
import { ShellExecutionService } from './shellExecutionService.js';

// Hoisted Mocks
const mockPtySpawn = vi.hoisted(() => vi.fn());
const mockCpSpawn = vi.hoisted(() => vi.fn());
const mockIsBinary = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => vi.fn());
const mockGetPty = vi.hoisted(() => vi.fn());

// Top-level Mocks
vi.mock('@lydell/node-pty', () => ({
  spawn: mockPtySpawn,
}));
vi.mock('child_process', () => ({
  spawn: mockCpSpawn,
}));
vi.mock('../utils/textUtils.js', () => ({
  isBinary: mockIsBinary,
}));
vi.mock('os', () => ({
  default: {
    platform: mockPlatform,
    constants: {
      signals: {
        SIGTERM: 15,
        SIGKILL: 9,
      },
    },
  },
  platform: mockPlatform,
  constants: {
    signals: {
      SIGTERM: 15,
      SIGKILL: 9,
    },
  },
}));
vi.mock('../utils/getPty.js', () => ({
  getPty: mockGetPty,
}));

const mockProcessKill = vi
  .spyOn(process, 'kill')
  .mockImplementation(() => true);

describe('ShellExecutionService', () => {
  let mockPtyProcess: EventEmitter & {
    pid: number;
    kill: Mock;
    onData: Mock;
    onExit: Mock;
  };
  let onOutputEventMock: Mock<(event: ShellOutputEvent) => void>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIsBinary.mockReturnValue(false);
    mockPlatform.mockReturnValue('linux');
    mockGetPty.mockResolvedValue({
      module: { spawn: mockPtySpawn },
      name: 'mock-pty',
    });

    onOutputEventMock = vi.fn();

    mockPtyProcess = new EventEmitter() as EventEmitter & {
      pid: number;
      kill: Mock;
      onData: Mock;
      onExit: Mock;
    };
    mockPtyProcess.pid = 12345;
    mockPtyProcess.kill = vi.fn();
    mockPtyProcess.onData = vi.fn();
    mockPtyProcess.onExit = vi.fn();

    mockPtySpawn.mockReturnValue(mockPtyProcess);
  });

  // Helper function to run a standard execution simulation
  const simulateExecution = async (
    command: string,
    simulation: (
      ptyProcess: typeof mockPtyProcess,
      ac: AbortController,
    ) => void,
  ) => {
    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      command,
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
      true,
    );

    await new Promise((resolve) => setImmediate(resolve));
    simulation(mockPtyProcess, abortController);
    const result = await handle.result;
    return { result, handle, abortController };
  };

  describe('Successful Execution', () => {
    it('should execute a command and capture output', async () => {
      const { result, handle } = await simulateExecution('ls -l', (pty) => {
        pty.onData.mock.calls[0][0]('file1.txt\n');
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
      });

      expect(mockPtySpawn).toHaveBeenCalledWith(
        'bash',
        ['-c', 'ls -l'],
        expect.any(Object),
      );
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.error).toBeNull();
      expect(result.aborted).toBe(false);
      expect(result.output).toBe('file1.txt');
      expect(handle.pid).toBe(12345);

      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        chunk: 'file1.txt',
      });
    });

    it('should strip ANSI codes from output', async () => {
      const { result } = await simulateExecution('ls --color=auto', (pty) => {
        pty.onData.mock.calls[0][0]('a\u001b[31mred\u001b[0mword');
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
      });

      expect(result.output).toBe('aredword');
      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        chunk: 'aredword',
      });
    });

    it('should correctly decode multi-byte characters split across chunks', async () => {
      const { result } = await simulateExecution('echo "你好"', (pty) => {
        const multiByteChar = '你好';
        pty.onData.mock.calls[0][0](multiByteChar.slice(0, 1));
        pty.onData.mock.calls[0][0](multiByteChar.slice(1));
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
      });
      expect(result.output).toBe('你好');
    });

    it('should handle commands with no output', async () => {
      const { result } = await simulateExecution('touch file', (pty) => {
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
      });

      expect(result.output).toBe('');
      expect(onOutputEventMock).not.toHaveBeenCalled();
    });
  });

  describe('Failed Execution', () => {
    it('should capture a non-zero exit code', async () => {
      const { result } = await simulateExecution('a-bad-command', (pty) => {
        pty.onData.mock.calls[0][0]('command not found');
        pty.onExit.mock.calls[0][0]({ exitCode: 127, signal: null });
      });

      expect(result.exitCode).toBe(127);
      expect(result.output).toBe('command not found');
      expect(result.error).toBeNull();
    });

    it('should capture a termination signal', async () => {
      const { result } = await simulateExecution('long-process', (pty) => {
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: 15 });
      });

      expect(result.exitCode).toBe(0);
      expect(result.signal).toBe(15);
    });

    it('should handle a synchronous spawn error', async () => {
      mockGetPty.mockImplementation(() => null);

      mockCpSpawn.mockImplementation(() => {
        throw new Error('Simulated PTY spawn error');
      });

      const handle = await ShellExecutionService.execute(
        'any-command',
        '/test/dir',
        onOutputEventMock,
        new AbortController().signal,
        true,
      );
      const result = await handle.result;

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain('Simulated PTY spawn error');
      expect(result.exitCode).toBe(1);
      expect(result.output).toBe('');
      expect(handle.pid).toBeUndefined();
    });
  });

  describe('Aborting Commands', () => {
    it('should abort a running process and set the aborted flag', async () => {
      const { result } = await simulateExecution(
        'sleep 10',
        (pty, abortController) => {
          abortController.abort();
          pty.onExit.mock.calls[0][0]({ exitCode: 1, signal: null });
        },
      );

      expect(result.aborted).toBe(true);
      expect(mockPtyProcess.kill).toHaveBeenCalled();
    });
  });

  describe('Binary Output', () => {
    it('should detect binary output and switch to progress events', async () => {
      mockIsBinary.mockReturnValueOnce(true);
      const binaryChunk1 = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const binaryChunk2 = Buffer.from([0x0d, 0x0a, 0x1a, 0x0a]);

      const { result } = await simulateExecution('cat image.png', (pty) => {
        pty.onData.mock.calls[0][0](binaryChunk1);
        pty.onData.mock.calls[0][0](binaryChunk2);
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
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

      await simulateExecution('cat mixed_file', (pty) => {
        pty.onData.mock.calls[0][0](Buffer.from('some text'));
        pty.onData.mock.calls[0][0](Buffer.from([0x00, 0x01, 0x02]));
        pty.onData.mock.calls[0][0](Buffer.from('more text'));
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
      });

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
      await simulateExecution('dir "foo bar"', (pty) =>
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null }),
      );

      expect(mockPtySpawn).toHaveBeenCalledWith(
        'cmd.exe',
        '/c dir "foo bar"',
        expect.any(Object),
      );
    });

    it('should use bash on Linux', async () => {
      mockPlatform.mockReturnValue('linux');
      await simulateExecution('ls "foo bar"', (pty) =>
        pty.onExit.mock.calls[0][0]({ exitCode: 0, signal: null }),
      );

      expect(mockPtySpawn).toHaveBeenCalledWith(
        'bash',
        ['-c', 'ls "foo bar"'],
        expect.any(Object),
      );
    });
  });
});

describe('ShellExecutionService child_process fallback', () => {
  let mockChildProcess: EventEmitter & Partial<ChildProcess>;
  let onOutputEventMock: Mock<(event: ShellOutputEvent) => void>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIsBinary.mockReturnValue(false);
    mockPlatform.mockReturnValue('linux');
    mockGetPty.mockResolvedValue(null);

    onOutputEventMock = vi.fn();

    mockChildProcess = new EventEmitter() as EventEmitter &
      Partial<ChildProcess>;
    mockChildProcess.stdout = new EventEmitter() as Readable;
    mockChildProcess.stderr = new EventEmitter() as Readable;
    mockChildProcess.kill = vi.fn();

    Object.defineProperty(mockChildProcess, 'pid', {
      value: 12345,
      configurable: true,
    });

    mockCpSpawn.mockReturnValue(mockChildProcess);
  });

  // Helper function to run a standard execution simulation
  const simulateExecution = async (
    command: string,
    simulation: (cp: typeof mockChildProcess, ac: AbortController) => void,
  ) => {
    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      command,
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
      true,
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

      expect(mockCpSpawn).toHaveBeenCalledWith(
        'ls -l',
        [],
        expect.objectContaining({ shell: 'bash' }),
      );
      expect(result.exitCode).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.error).toBeNull();
      expect(result.aborted).toBe(false);
      expect(result.output).toBe('file1.txt\na warning');
      expect(handle.pid).toBe(12345);

      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        chunk: 'file1.txt\n',
      });
      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
        chunk: 'a warning',
      });
    });

    it('should strip ANSI codes from output', async () => {
      const { result } = await simulateExecution('ls --color=auto', (cp) => {
        cp.stdout?.emit('data', Buffer.from('a\u001b[31mred\u001b[0mword'));
        cp.emit('exit', 0, null);
      });

      expect(result.output).toBe('aredword');
      expect(onOutputEventMock).toHaveBeenCalledWith({
        type: 'data',
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
      expect(result.output).toBe('你好');
    });

    it('should handle commands with no output', async () => {
      const { result } = await simulateExecution('touch file', (cp) => {
        cp.emit('exit', 0, null);
      });

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
      expect(result.output).toBe('command not found');
      expect(result.error).toBeNull();
    });

    it('should capture a termination signal', async () => {
      const { result } = await simulateExecution('long-process', (cp) => {
        cp.emit('exit', null, 'SIGTERM');
      });

      expect(result.exitCode).toBeNull();
      expect(result.signal).toBe(15);
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

    it('handles errors that do not fire the exit event', async () => {
      const error = new Error('spawn abc ENOENT');
      const { result } = await simulateExecution('touch cat.jpg', (cp) => {
        cp.emit('error', error); // No exit event is fired.
      });

      expect(result.error).toBe(error);
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
            expect(mockCpSpawn).toHaveBeenCalledWith(expectedCommand, [
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
      const handle = await ShellExecutionService.execute(
        'unresponsive_process',
        '/test/dir',
        onOutputEventMock,
        abortController.signal,
        true,
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
      expect(result.signal).toBe(9);
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

      expect(mockCpSpawn).toHaveBeenCalledWith(
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

      expect(mockCpSpawn).toHaveBeenCalledWith(
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

describe('ShellExecutionService execution method selection', () => {
  let onOutputEventMock: Mock<(event: ShellOutputEvent) => void>;
  let mockPtyProcess: EventEmitter & {
    pid: number;
    kill: Mock;
    onData: Mock;
    onExit: Mock;
  };
  let mockChildProcess: EventEmitter & Partial<ChildProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    onOutputEventMock = vi.fn();

    // Mock for pty
    mockPtyProcess = new EventEmitter() as EventEmitter & {
      pid: number;
      kill: Mock;
      onData: Mock;
      onExit: Mock;
    };
    mockPtyProcess.pid = 12345;
    mockPtyProcess.kill = vi.fn();
    mockPtyProcess.onData = vi.fn();
    mockPtyProcess.onExit = vi.fn();
    mockPtySpawn.mockReturnValue(mockPtyProcess);
    mockGetPty.mockResolvedValue({
      module: { spawn: mockPtySpawn },
      name: 'mock-pty',
    });

    // Mock for child_process
    mockChildProcess = new EventEmitter() as EventEmitter &
      Partial<ChildProcess>;
    mockChildProcess.stdout = new EventEmitter() as Readable;
    mockChildProcess.stderr = new EventEmitter() as Readable;
    mockChildProcess.kill = vi.fn();
    Object.defineProperty(mockChildProcess, 'pid', {
      value: 54321,
      configurable: true,
    });
    mockCpSpawn.mockReturnValue(mockChildProcess);
  });

  it('should use node-pty when shouldUseNodePty is true and pty is available', async () => {
    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      'test command',
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
      true, // shouldUseNodePty
    );

    // Simulate exit to allow promise to resolve
    mockPtyProcess.onExit.mock.calls[0][0]({ exitCode: 0, signal: null });
    const result = await handle.result;

    expect(mockGetPty).toHaveBeenCalled();
    expect(mockPtySpawn).toHaveBeenCalled();
    expect(mockCpSpawn).not.toHaveBeenCalled();
    expect(result.executionMethod).toBe('mock-pty');
  });

  it('should use child_process when shouldUseNodePty is false', async () => {
    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      'test command',
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
      false, // shouldUseNodePty
    );

    // Simulate exit to allow promise to resolve
    mockChildProcess.emit('exit', 0, null);
    const result = await handle.result;

    expect(mockGetPty).not.toHaveBeenCalled();
    expect(mockPtySpawn).not.toHaveBeenCalled();
    expect(mockCpSpawn).toHaveBeenCalled();
    expect(result.executionMethod).toBe('child_process');
  });

  it('should fall back to child_process if pty is not available even if shouldUseNodePty is true', async () => {
    mockGetPty.mockResolvedValue(null);

    const abortController = new AbortController();
    const handle = await ShellExecutionService.execute(
      'test command',
      '/test/dir',
      onOutputEventMock,
      abortController.signal,
      true, // shouldUseNodePty
    );

    // Simulate exit to allow promise to resolve
    mockChildProcess.emit('exit', 0, null);
    const result = await handle.result;

    expect(mockGetPty).toHaveBeenCalled();
    expect(mockPtySpawn).not.toHaveBeenCalled();
    expect(mockCpSpawn).toHaveBeenCalled();
    expect(result.executionMethod).toBe('child_process');
  });
});
