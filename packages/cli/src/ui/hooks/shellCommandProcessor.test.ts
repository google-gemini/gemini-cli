/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

const mockIsBinary = vi.hoisted(() => vi.fn());
const mockShellExecutionService = vi.hoisted(() => vi.fn());
vi.mock('@google/gemini-cli-core', () => ({
  ShellExecutionService: { execute: mockShellExecutionService },
  isBinary: mockIsBinary,
}));
vi.mock('fs');
vi.mock('os');
vi.mock('crypto');
vi.mock('../utils/textUtils.js');

import {
  useShellCommandProcessor,
  OUTPUT_UPDATE_INTERVAL_MS,
} from './shellCommandProcessor.js';
import {
  type Config,
  type GeminiClient,
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '@google/gemini-cli-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ToolCallStatus } from '../types.js';

describe('useShellCommandProcessor', () => {
  let addItemToHistoryMock: Mock;
  let setPendingHistoryItemMock: Mock;
  let onExecMock: Mock;
  let onDebugMessageMock: Mock;
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;

  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;

  let setShellInputFocusedMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    addItemToHistoryMock = vi.fn();
    setPendingHistoryItemMock = vi.fn();
    onExecMock = vi.fn();
    onDebugMessageMock = vi.fn();
    setShellInputFocusedMock = vi.fn();
    mockConfig = {
      getTargetDir: () => '/test/dir',
      getShouldUseNodePtyShell: () => false,
      getShellExecutionConfig: () => ({
        terminalHeight: 20,
        terminalWidth: 80,
      }),
    } as Config;
    mockGeminiClient = { addHistory: vi.fn() } as unknown as GeminiClient;

    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    (vi.mocked(crypto.randomBytes) as Mock).mockReturnValue(
      Buffer.from('abcdef', 'hex'),
    );
    mockIsBinary.mockReturnValue(false);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    mockShellExecutionService.mockImplementation((_cmd, _cwd, callback) => {
      mockShellOutputCallback = callback;
      return Promise.resolve({
        pid: 12345,
        result: new Promise((resolve) => {
          resolveExecutionPromise = resolve;
        }),
      });
    });
  });

  const renderProcessorHook = () =>
    renderHook(() =>
      useShellCommandProcessor(
        addItemToHistoryMock,
        setPendingHistoryItemMock,
        onExecMock,
        onDebugMessageMock,
        mockConfig,
        mockGeminiClient,
        setShellInputFocusedMock,
      ),
    );

  const createMockServiceResult = (
    overrides: Partial<ShellExecutionResult> = {},
  ): ShellExecutionResult => ({
    rawOutput: Buffer.from(overrides.output || ''),
    output: 'Success',
    exitCode: 0,
    signal: null,
    error: null,
    aborted: false,
    pid: 12345,
    executionMethod: 'child_process',
    ...overrides,
  });

  it('should initiate command execution and set pending state', async () => {
    const { result } = renderProcessorHook();

    act(() => {
      result.current.handleShellCommand('ls -l', new AbortController().signal);
    });

    expect(addItemToHistoryMock).toHaveBeenCalledWith(
      { type: 'user_shell', text: 'ls -l' },
      expect.any(Number),
    );
    expect(setPendingHistoryItemMock).toHaveBeenCalledWith({
      type: 'tool_group',
      tools: [
        expect.objectContaining({
          name: 'Shell Command',
          status: ToolCallStatus.Executing,
        }),
      ],
    });
    const tmpFile = path.join(os.tmpdir(), 'shell_pwd_abcdef.tmp');
    const wrappedCommand = `{ ls -l; }; __code=$?; pwd > "${tmpFile}"; exit $__code`;
    expect(mockShellExecutionService).toHaveBeenCalledWith(
      wrappedCommand,
      '/test/dir',
      expect.any(Function),
      expect.any(Object),
      false,
      expect.any(Object),
    );
    expect(onExecMock).toHaveBeenCalledWith(expect.any(Promise));
  });

  it('should handle successful execution and update history correctly', async () => {
    const { result } = renderProcessorHook();

    act(() => {
      result.current.handleShellCommand(
        'echo "ok"',
        new AbortController().signal,
      );
    });
    const execPromise = onExecMock.mock.calls[0][0];

    act(() => {
      resolveExecutionPromise(createMockServiceResult({ output: 'ok' }));
    });
    await act(async () => await execPromise);

    expect(setPendingHistoryItemMock).toHaveBeenCalledWith(null);
    expect(addItemToHistoryMock).toHaveBeenCalledTimes(2); // Initial + final
    expect(addItemToHistoryMock.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            status: ToolCallStatus.Success,
            resultDisplay: 'ok',
          }),
        ],
      }),
    );
    expect(mockGeminiClient.addHistory).toHaveBeenCalled();
    expect(setShellInputFocusedMock).toHaveBeenCalledWith(false);
  });

  it('should handle command failure and display error status', async () => {
    const { result } = renderProcessorHook();

    act(() => {
      result.current.handleShellCommand(
        'bad-cmd',
        new AbortController().signal,
      );
    });
    const execPromise = onExecMock.mock.calls[0][0];

    act(() => {
      resolveExecutionPromise(
        createMockServiceResult({ exitCode: 127, output: 'not found' }),
      );
    });
    await act(async () => await execPromise);

    const finalHistoryItem = addItemToHistoryMock.mock.calls[1][0];
    expect(finalHistoryItem.tools[0].status).toBe(ToolCallStatus.Error);
    expect(finalHistoryItem.tools[0].resultDisplay).toContain(
      'Command exited with code 127',
    );
    expect(finalHistoryItem.tools[0].resultDisplay).toContain('not found');
    expect(setShellInputFocusedMock).toHaveBeenCalledWith(false);
  });

  describe('UI Streaming and Throttling', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should throttle pending UI updates for text streams (non-interactive)', async () => {
      const { result } = renderProcessorHook();
      act(() => {
        result.current.handleShellCommand(
          'stream',
          new AbortController().signal,
        );
      });

      // Verify it's using the non-pty shell
      const wrappedCommand = `{ stream; }; __code=$?; pwd > "${path.join(
        os.tmpdir(),
        'shell_pwd_abcdef.tmp',
      )}"; exit $__code`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        '/test/dir',
        expect.any(Function),
        expect.any(Object),
        false, // enableInteractiveShell
        expect.any(Object),
      );

      // Wait for the async PID update to happen.
      await vi.waitFor(() => {
        // It's called once for initial, and once for the PID update.
        expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(2);
      });

      // Simulate rapid output
      act(() => {
        mockShellOutputCallback({
          type: 'data',
          chunk: 'hello',
        });
      });
      // The count should still be 2, as throttling is in effect.
      expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(2);

      // Simulate more rapid output
      act(() => {
        mockShellOutputCallback({
          type: 'data',
          chunk: ' world',
        });
      });
      expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(2);

      // Advance time, but the update won't happen until the next event
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);
      });

      // Trigger one more event to cause the throttled update to fire.
      act(() => {
        mockShellOutputCallback({
          type: 'data',
          chunk: '',
        });
      });

      // Now the cumulative update should have occurred.
      // Call 1: Initial, Call 2: PID update, Call 3: Throttled stream update
      expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(3);

      const streamUpdateFn = setPendingHistoryItemMock.mock.calls[2][0];
      if (!streamUpdateFn || typeof streamUpdateFn !== 'function') {
        throw new Error(
          'setPendingHistoryItem was not called with a stream updater function',
        );
      }

      // Get the state after the PID update to feed into the stream updater
      const pidUpdateFn = setPendingHistoryItemMock.mock.calls[1][0];
      const initialState = setPendingHistoryItemMock.mock.calls[0][0];
      const stateAfterPid = pidUpdateFn(initialState);

      const stateAfterStream = streamUpdateFn(stateAfterPid);
      expect(stateAfterStream.tools[0].resultDisplay).toBe('hello world');
    });

    it('should show binary progress messages correctly', async () => {
      const { result } = renderProcessorHook();
      act(() => {
        result.current.handleShellCommand(
          'cat img',
          new AbortController().signal,
        );
      });

      // Should immediately show the detection message
      act(() => {
        mockShellOutputCallback({ type: 'binary_detected' });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);
      });
      // Send another event to trigger the update
      act(() => {
        mockShellOutputCallback({ type: 'binary_progress', bytesReceived: 0 });
      });

      // The state update is functional, so we test it by executing it.
      const updaterFn1 = setPendingHistoryItemMock.mock.lastCall?.[0];
      if (!updaterFn1) {
        throw new Error('setPendingHistoryItem was not called');
      }
      const initialState = setPendingHistoryItemMock.mock.calls[0][0];
      const stateAfterBinaryDetected = updaterFn1(initialState);

      expect(stateAfterBinaryDetected).toEqual(
        expect.objectContaining({
          tools: [
            expect.objectContaining({
              resultDisplay: '[Binary output detected. Halting stream...]',
            }),
          ],
        }),
      );

      // Now test progress updates
      await act(async () => {
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);
      });
      act(() => {
        mockShellOutputCallback({
          type: 'binary_progress',
          bytesReceived: 2048,
        });
      });

      const updaterFn2 = setPendingHistoryItemMock.mock.lastCall?.[0];
      if (!updaterFn2) {
        throw new Error('setPendingHistoryItem was not called');
      }
      const stateAfterProgress = updaterFn2(stateAfterBinaryDetected);
      expect(stateAfterProgress).toEqual(
        expect.objectContaining({
          tools: [
            expect.objectContaining({
              resultDisplay: '[Receiving binary output... 2.0 KB received]',
            }),
          ],
        }),
      );
    });
  });

  it('should not wrap the command on Windows', async () => {
    vi.mocked(os.platform).mockReturnValue('win32');
    const { result } = renderProcessorHook();

    act(() => {
      result.current.handleShellCommand('dir', new AbortController().signal);
    });

    expect(mockShellExecutionService).toHaveBeenCalledWith(
      'dir',
      '/test/dir',
      expect.any(Function),
      expect.any(Object),
      false,
      expect.any(Object),
    );
  });

  it('should handle command abort and display cancelled status', async () => {
    const { result } = renderProcessorHook();
    const abortController = new AbortController();

    act(() => {
      result.current.handleShellCommand('sleep 5', abortController.signal);
    });
    const execPromise = onExecMock.mock.calls[0][0];

    act(() => {
      abortController.abort();
      resolveExecutionPromise(
        createMockServiceResult({ aborted: true, output: 'Canceled' }),
      );
    });
    await act(async () => await execPromise);

    const finalHistoryItem = addItemToHistoryMock.mock.calls[1][0];
    expect(finalHistoryItem.tools[0].status).toBe(ToolCallStatus.Canceled);
    expect(finalHistoryItem.tools[0].resultDisplay).toContain(
      'Command was cancelled.',
    );
    expect(setShellInputFocusedMock).toHaveBeenCalledWith(false);
  });

  it('should handle binary output result correctly', async () => {
    const { result } = renderProcessorHook();
    const binaryBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockIsBinary.mockReturnValue(true);

    act(() => {
      result.current.handleShellCommand(
        'cat image.png',
        new AbortController().signal,
      );
    });
    const execPromise = onExecMock.mock.calls[0][0];

    act(() => {
      resolveExecutionPromise(
        createMockServiceResult({ rawOutput: binaryBuffer }),
      );
    });
    await act(async () => await execPromise);

    const finalHistoryItem = addItemToHistoryMock.mock.calls[1][0];
    expect(finalHistoryItem.tools[0].status).toBe(ToolCallStatus.Success);
    expect(finalHistoryItem.tools[0].resultDisplay).toBe(
      '[Command produced binary output, which is not shown.]',
    );
  });

  it('should handle promise rejection and show an error', async () => {
    const { result } = renderProcessorHook();
    const testError = new Error('Unexpected failure');
    mockShellExecutionService.mockImplementation(() => ({
      pid: 12345,
      result: Promise.reject(testError),
    }));

    act(() => {
      result.current.handleShellCommand(
        'a-command',
        new AbortController().signal,
      );
    });
    const execPromise = onExecMock.mock.calls[0][0];

    await act(async () => await execPromise);

    expect(setPendingHistoryItemMock).toHaveBeenCalledWith(null);
    expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
      type: 'error',
      text: 'An unexpected error occurred: Unexpected failure',
    });
    expect(setShellInputFocusedMock).toHaveBeenCalledWith(false);
  });

  it('should handle synchronous errors during execution and clean up resources', async () => {
    const testError = new Error('Synchronous spawn error');
    mockShellExecutionService.mockImplementation(() => {
      throw testError;
    });
    // Mock that the temp file was created before the error was thrown
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const { result } = renderProcessorHook();

    act(() => {
      result.current.handleShellCommand(
        'a-command',
        new AbortController().signal,
      );
    });
    const execPromise = onExecMock.mock.calls[0][0];

    await act(async () => await execPromise);

    expect(setPendingHistoryItemMock).toHaveBeenCalledWith(null);
    expect(addItemToHistoryMock).toHaveBeenCalledTimes(2);
    expect(addItemToHistoryMock.mock.calls[1][0]).toEqual({
      type: 'error',
      text: 'An unexpected error occurred: Synchronous spawn error',
    });
    const tmpFile = path.join(os.tmpdir(), 'shell_pwd_abcdef.tmp');
    // Verify that the temporary file was cleaned up
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    expect(setShellInputFocusedMock).toHaveBeenCalledWith(false);
  });

  describe('Directory Change Warning', () => {
    it('should show a warning if the working directory changes', async () => {
      const tmpFile = path.join(os.tmpdir(), 'shell_pwd_abcdef.tmp');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('/test/dir/new'); // A different directory

      const { result } = renderProcessorHook();
      act(() => {
        result.current.handleShellCommand(
          'cd new',
          new AbortController().signal,
        );
      });
      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        resolveExecutionPromise(createMockServiceResult());
      });
      await act(async () => await execPromise);

      const finalHistoryItem = addItemToHistoryMock.mock.calls[1][0];
      expect(finalHistoryItem.tools[0].resultDisplay).toContain(
        "WARNING: shell mode is stateless; the directory change to '/test/dir/new' will not persist.",
      );
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    });

    it('should NOT show a warning if the directory does not change', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('/test/dir'); // The same directory

      const { result } = renderProcessorHook();
      act(() => {
        result.current.handleShellCommand('ls', new AbortController().signal);
      });
      const execPromise = onExecMock.mock.calls[0][0];

      act(() => {
        resolveExecutionPromise(createMockServiceResult());
      });
      await act(async () => await execPromise);

      const finalHistoryItem = addItemToHistoryMock.mock.calls[1][0];
      expect(finalHistoryItem.tools[0].resultDisplay).not.toContain('WARNING');
    });
  });

  describe('ActiveShellPtyId management', () => {
    beforeEach(() => {
      // The real service returns a promise that resolves with the pid and result promise
      mockShellExecutionService.mockImplementation((_cmd, _cwd, callback) => {
        mockShellOutputCallback = callback;
        return Promise.resolve({
          pid: 12345,
          result: new Promise((resolve) => {
            resolveExecutionPromise = resolve;
          }),
        });
      });
    });

    it('should have activeShellPtyId as null initially', () => {
      const { result } = renderProcessorHook();
      expect(result.current.activeShellPtyId).toBeNull();
    });

    it('should set activeShellPtyId when a command with a PID starts', async () => {
      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand('ls', new AbortController().signal);
      });

      await vi.waitFor(() => {
        expect(result.current.activeShellPtyId).toBe(12345);
      });
    });

    it('should update the pending history item with the ptyId', async () => {
      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand('ls', new AbortController().signal);
      });

      await vi.waitFor(() => {
        // Wait for the second call which is the functional update
        expect(setPendingHistoryItemMock).toHaveBeenCalledTimes(2);
      });

      // The state update is functional, so we test it by executing it.
      const updaterFn = setPendingHistoryItemMock.mock.lastCall?.[0];
      expect(typeof updaterFn).toBe('function');

      // The initial state is the first call to setPendingHistoryItem
      const initialState = setPendingHistoryItemMock.mock.calls[0][0];
      const stateAfterPid = updaterFn(initialState);

      expect(stateAfterPid.tools[0].ptyId).toBe(12345);
    });

    it('should reset activeShellPtyId to null after successful execution', async () => {
      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand('ls', new AbortController().signal);
      });
      const execPromise = onExecMock.mock.calls[0][0];

      await vi.waitFor(() => {
        expect(result.current.activeShellPtyId).toBe(12345);
      });

      act(() => {
        resolveExecutionPromise(createMockServiceResult());
      });
      await act(async () => await execPromise);

      expect(result.current.activeShellPtyId).toBeNull();
    });

    it('should reset activeShellPtyId to null after failed execution', async () => {
      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand(
          'bad-cmd',
          new AbortController().signal,
        );
      });
      const execPromise = onExecMock.mock.calls[0][0];

      await vi.waitFor(() => {
        expect(result.current.activeShellPtyId).toBe(12345);
      });

      act(() => {
        resolveExecutionPromise(createMockServiceResult({ exitCode: 1 }));
      });
      await act(async () => await execPromise);

      expect(result.current.activeShellPtyId).toBeNull();
    });

    it('should reset activeShellPtyId to null if execution promise rejects', async () => {
      let rejectResultPromise: (reason?: unknown) => void;
      mockShellExecutionService.mockImplementation(() =>
        Promise.resolve({
          pid: 1234_5,
          result: new Promise((_, reject) => {
            rejectResultPromise = reject;
          }),
        }),
      );
      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand('cmd', new AbortController().signal);
      });
      const execPromise = onExecMock.mock.calls[0][0];

      await vi.waitFor(() => {
        expect(result.current.activeShellPtyId).toBe(12345);
      });

      act(() => {
        rejectResultPromise(new Error('Failure'));
      });

      await act(async () => await execPromise);

      expect(result.current.activeShellPtyId).toBeNull();
    });

    it('should not set activeShellPtyId on synchronous execution error and should remain null', async () => {
      mockShellExecutionService.mockImplementation(() => {
        throw new Error('Sync Error');
      });
      const { result } = renderProcessorHook();

      expect(result.current.activeShellPtyId).toBeNull(); // Pre-condition

      act(() => {
        result.current.handleShellCommand('cmd', new AbortController().signal);
      });
      const execPromise = onExecMock.mock.calls[0][0];

      // The hook's state should not have changed to a PID
      expect(result.current.activeShellPtyId).toBeNull();

      await act(async () => await execPromise); // Let the promise resolve

      // And it should still be null after everything is done
      expect(result.current.activeShellPtyId).toBeNull();
    });

    it('should not set activeShellPtyId if service does not return a PID', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, callback) => {
        mockShellOutputCallback = callback;
        return Promise.resolve({
          pid: undefined, // No PID
          result: new Promise((resolve) => {
            resolveExecutionPromise = resolve;
          }),
        });
      });

      const { result } = renderProcessorHook();

      act(() => {
        result.current.handleShellCommand('ls', new AbortController().signal);
      });

      // Let microtasks run
      await act(async () => {});

      expect(result.current.activeShellPtyId).toBeNull();
    });
  });
});
