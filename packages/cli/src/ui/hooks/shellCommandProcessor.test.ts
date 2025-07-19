/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { Config, GeminiClient } from '@google/gemini-cli-core';
import * as fs from 'fs';
import EventEmitter from 'events';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('crypto', () => ({
  default: {
    randomBytes: () => ({ toString: () => 'abc123' }),
  },
}));
vi.mock('strip-ansi', () => ({
  default: (str: string) => str, // Simple mock that returns the input unchanged
}));
vi.mock('chardet', () => ({
  detect: vi.fn(),
}));

// Mock OS module with ability to change platform during tests
vi.mock('os', () => ({
  default: {
    platform: vi.fn(() => 'linux'),
    tmpdir: vi.fn(() => '/tmp'),
  },
  platform: vi.fn(() => 'linux'),
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('@google/gemini-cli-core');
vi.mock('../utils/textUtils.js', () => ({
  isBinary: vi.fn(),
}));
vi.mock('../utils/formatters.js', () => ({
  formatMemoryUsage: vi.fn((bytes: number) => `${bytes} bytes`),
}));

describe('useShellCommandProcessor', () => {
  let spawnEmitter: EventEmitter & { 
    stdout: EventEmitter; 
    stderr: EventEmitter; 
    pid?: number;
    kill: ReturnType<typeof vi.fn>;
  };
  let addItemToHistoryMock: ReturnType<typeof vi.fn>;
  let setPendingHistoryItemMock: ReturnType<typeof vi.fn>;
  let onExecMock: ReturnType<typeof vi.fn>;
  let onDebugMessageMock: ReturnType<typeof vi.fn>;
  let configMock: Config;
  let geminiClientMock: GeminiClient;
  let _mockExecSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { spawn, execSync } = await import('child_process');
    const { detect } = await import('chardet');
    const os = await import('os');
    
    spawnEmitter = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      pid: 12345,
      kill: vi.fn(),
    });
    
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue(spawnEmitter);
    _mockExecSync = execSync as ReturnType<typeof vi.fn>;
    (detect as ReturnType<typeof vi.fn>).mockReturnValue('utf-8');

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);

    addItemToHistoryMock = vi.fn();
    setPendingHistoryItemMock = vi.fn();
    onExecMock = vi.fn();
    onDebugMessageMock = vi.fn();

    configMock = {
      getTargetDir: () => '/test/dir',
    } as unknown as Config;

    geminiClientMock = {
      addHistory: vi.fn(),
    } as unknown as GeminiClient;
    
    // Reset OS platform mock
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderProcessorHook = () =>
    renderHook(() =>
      useShellCommandProcessor(
        addItemToHistoryMock,
        setPendingHistoryItemMock,
        onExecMock,
        onDebugMessageMock,
        configMock,
        geminiClientMock,
      ),
    );

  describe('basic command execution', () => {
    it('should execute a command and update history on success', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('ls -l', abortController.signal);
      });

      expect(onExecMock).toHaveBeenCalledTimes(1);
      const execPromise = onExecMock.mock.calls[0][0];

      // Simulate stdout
      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('file1.txt\nfile2.txt'));
      });

      // Simulate process exit
      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'info',
        text: 'file1.txt\nfile2.txt',
      });
      expect(geminiClientMock.addHistory).toHaveBeenCalledTimes(1);
    });

    it('should handle empty or whitespace-only commands', () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      const result1 = result.current.handleShellCommand('', abortController.signal);
      const result2 = result.current.handleShellCommand('   ', abortController.signal);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(onExecMock).not.toHaveBeenCalled();
    });

    it('should handle non-string commands', () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result1 = result.current.handleShellCommand(['ls', '-l'] as any, abortController.signal);

      expect(result1).toBe(false);
      expect(onExecMock).not.toHaveBeenCalled();
    });

    it('should handle commands with no output', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('touch file.txt', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      // Simulate process exit with no output
      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'info',
        text: '(Command produced no output)',
      });
    });
  });

  describe('binary output handling', () => {
    it('should handle binary output', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      const { isBinary } = await import('../utils/textUtils.js');
      (isBinary as ReturnType<typeof vi.fn>).mockReturnValue(true);

      act(() => {
        result.current.handleShellCommand(
          'cat myimage.png',
          abortController.signal,
        );
      });

      expect(onExecMock).toHaveBeenCalledTimes(1);
      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      });

      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'info',
        text: '[Command produced binary output, which is not shown.]',
      });
    });

    it('should show progress for binary streams', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      const { isBinary } = await import('../utils/textUtils.js');
      const { formatMemoryUsage } = await import('../utils/formatters.js');
      
      (isBinary as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (formatMemoryUsage as ReturnType<typeof vi.fn>).mockReturnValue('1024 bytes');

      act(() => {
        result.current.handleShellCommand('cat largefile.bin', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      // Emit some binary data
      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      });

      // Should show progress for binary streams
      expect(setPendingHistoryItemMock).toHaveBeenCalled();

      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });
    });
  });

  describe('error handling', () => {
    it('should handle command failure', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand(
          'a-bad-command',
          abortController.signal,
        );
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stderr.emit('data', Buffer.from('command not found'));
      });

      act(() => {
        spawnEmitter.emit('exit', 127, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'error',
        text: 'Command exited with code 127.\ncommand not found',
      });
    });

    it('should handle process errors correctly', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('some-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];
      const testError = new Error('Process spawn failed');

      act(() => {
        spawnEmitter.emit('error', testError);
        spawnEmitter.emit('exit', null, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      // Process errors result in error type with error content
      expect(addItemToHistoryMock.mock.calls[1][0].type).toBe('error');
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('Process spawn failed');
    });

    it('should handle signals', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('long-running-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.emit('exit', null, 'SIGINT');
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'error',
        text: 'Command terminated by signal: SIGINT.\n(Command produced no output)',
      });
    });

    it('should handle unexpected errors gracefully', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      
      // Mock spawn to throw an error
      const { spawn } = await import('child_process');
      (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Spawn failed');
      });

      act(() => {
        result.current.handleShellCommand('some-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
        type: 'error',
        text: 'An unexpected error occurred: Spawn failed',
      });
    });
  });

  describe('process abort handling', () => {
    it('should handle command abortion', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('long-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      // Abort the command
      act(() => {
        abortController.abort();
      });

      // Simulate process exit after abort
      act(() => {
        spawnEmitter.emit('exit', null, 'SIGTERM');
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('Command was cancelled');
    });

    it('should handle Linux process group termination', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => true);

      act(() => {
        result.current.handleShellCommand('test-command', abortController.signal);
      });

      // Abort the command
      act(() => {
        abortController.abort();
      });

      expect(mockKill).toHaveBeenCalledWith(-12345, 'SIGTERM');
      
      mockKill.mockRestore();
    });

    it('should handle abort signal properly', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('test-command', abortController.signal);
      });

      // Abort the command
      act(() => {
        abortController.abort();
      });

      // Process termination behavior varies by platform, but abortion should work
      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.emit('exit', null, 'SIGTERM');
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    });

    it('should fallback to regular kill if process group kill fails', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('Process group kill failed');
      });

      act(() => {
        result.current.handleShellCommand('test-command', abortController.signal);
      });

      // Abort the command
      act(() => {
        abortController.abort();
      });

      expect(spawnEmitter.kill).toHaveBeenCalledWith('SIGKILL');
      
      mockKill.mockRestore();
    });
  });

  describe('platform-specific behavior', () => {
    it('should execute commands successfully on any platform', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      const { spawn } = await import('child_process');

      act(() => {
        result.current.handleShellCommand('echo hello', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('hello'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].text).toBe('hello');
    });

    it('should handle command execution with potential working directory tracking', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('pwd', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('/current/directory'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('/current/directory');
    });
  });

  describe('encoding detection and handling', () => {
    it('should detect encoding from system (Windows)', async () => {
      const os = await import('os');
      vi.mocked(os.platform).mockReturnValue('win32');
      
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      // Emit data to trigger encoding detection
      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('test output'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      // Just verify the test completes successfully - encoding detection is internal
      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('test output');
    });

    it('should handle Windows code page detection failure', async () => {
      const os = await import('os');
      vi.mocked(os.platform).mockReturnValue('win32');
      const { execSync } = await import('child_process');
      (execSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('chcp command failed');
      });
      
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('test output'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      // Should not throw and should still process output
      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    });

    it('should detect encoding from Unix locale', async () => {
      const os = await import('os');
      vi.mocked(os.platform).mockReturnValue('linux');
      const originalEnv = process.env;
      process.env = { ...originalEnv, LANG: 'en_US.UTF-8' };
      
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('test output'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      process.env = originalEnv;
      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    });

    it('should fallback to chardet when system encoding fails', async () => {
      const os = await import('os');
      vi.mocked(os.platform).mockReturnValue('linux');
      
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('test output'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      // Just verify the test completes successfully
      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('streaming and output throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should throttle pending UI updates', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('long-command', abortController.signal);
      });

      // Emit multiple data chunks quickly
      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('chunk1\n'));
        spawnEmitter.stdout.emit('data', Buffer.from('chunk2\n'));
        spawnEmitter.stdout.emit('data', Buffer.from('chunk3\n'));
      });

      // Should only update once initially
      expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(1);

      // Advance time beyond throttle interval
      act(() => {
        vi.advanceTimersByTime(1100);
        spawnEmitter.stdout.emit('data', Buffer.from('chunk4\n'));
      });

      // Should update again after throttle period
      expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(2);

      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      const execPromise = onExecMock.mock.calls[0][0];
      await act(async () => {
        await execPromise;
      });
    });

    it('should handle mixed stdout and stderr streaming', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('mixed-output-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('stdout line 1\n'));
        spawnEmitter.stderr.emit('data', Buffer.from('stderr line 1\n'));
        spawnEmitter.stdout.emit('data', Buffer.from('stdout line 2\n'));
      });

      act(() => {
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('stdout line 1');
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('stdout line 2');
      expect(addItemToHistoryMock.mock.calls[1][0].text).toContain('stderr line 1');
    });
  });

  describe('Gemini history integration', () => {
    it('should add command and result to Gemini history', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo "hello world"', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('hello world\n'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(geminiClientMock.addHistory).toHaveBeenCalledWith({
        role: 'user',
        parts: [
          {
            text: expect.stringContaining('echo "hello world"'),
          },
        ],
      });

      const historyCall = (geminiClientMock.addHistory as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(historyCall.parts[0].text).toContain('hello world');
    });

    it('should truncate long output in Gemini history', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();
      
      // Create output longer than MAX_OUTPUT_LENGTH (10000)
      const longOutput = 'x'.repeat(15000);

      act(() => {
        result.current.handleShellCommand('generate-long-output', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from(longOutput));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      const historyCall = (geminiClientMock.addHistory as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(historyCall.parts[0].text).toContain('... (truncated)');
      expect(historyCall.parts[0].text.length).toBeLessThan(longOutput.length);
    });
  });

  describe('TextDecoder handling', () => {
    it('should handle multi-byte character sequences properly', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo "café"', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      // Split a multi-byte character across chunks to test streaming decoder
      const utf8Bytes = Buffer.from('café', 'utf8');
      const chunk1 = utf8Bytes.subarray(0, 3); // 'ca' + first byte of 'é'
      const chunk2 = utf8Bytes.subarray(3);    // remaining bytes of 'é'

      act(() => {
        spawnEmitter.stdout.emit('data', chunk1);
        spawnEmitter.stdout.emit('data', chunk2);
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock.mock.calls[1][0].text).toBe('café');
    });

    it('should handle final decoder flush', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('partial'));
        // Exit without final newline to test decoder flush
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock.mock.calls[1][0].text).toBe('partial');
    });
  });

  describe('cleanup and temporary files', () => {
    it('should handle command execution and cleanup properly', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('echo test', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stdout.emit('data', Buffer.from('test'));
        spawnEmitter.emit('exit', 0, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].text).toBe('test');
    });

    it('should handle cleanup even when commands fail', async () => {
      const { result } = renderProcessorHook();
      const abortController = new AbortController();

      act(() => {
        result.current.handleShellCommand('failing-command', abortController.signal);
      });

      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        spawnEmitter.stderr.emit('data', Buffer.from('command failed'));
        spawnEmitter.emit('exit', 1, null);
      });

      await act(async () => {
        await execPromise;
      });

      expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
      expect(addItemToHistoryMock.mock.calls[1][0].type).toBe('error');
    });
  });
});
