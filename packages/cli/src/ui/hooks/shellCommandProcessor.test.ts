/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { type Config } from '@gemini-cli/core';
import { type PartListUnion } from '@google/genai';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import type * as FsMod from 'fs';
import type { exec as ExecType } from 'child_process'; // For typing the injected mock

// Mocks
const mockAddItemToHistory = vi.fn();
const mockSetPendingHistoryItem = vi.fn();
const mockOnExec = vi.fn(async (promise) => await promise);
const mockOnDebugMessage = vi.fn();
const mockGetTargetDir = vi.fn();
let mockExecuteCommand: ReturnType<typeof vi.fn>; // This will be our injected mock for child_process.exec

const mockConfig = {
  getTargetDir: mockGetTargetDir,
} as unknown as Config;

vi.mock('crypto', () => ({
  default: {
    randomBytes: vi.fn(() => ({ toString: vi.fn(() => 'randomBytes') })),
  },
  randomBytes: vi.fn(() => ({ toString: vi.fn(() => 'randomBytes') })),
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
    sep: '/',
  },
  join: vi.fn((...args) => args.join('/')),
  sep: '/',
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp'),
    platform: vi.fn(() => 'linux'),
  },
  tmpdir: vi.fn(() => '/tmp'),
  platform: vi.fn(() => 'linux'),
}));

// Configure the fs mock to use new vi.fn() instances created within the factory
vi.mock('fs', async (importOriginal) => {
  const original = (await importOriginal()) as typeof FsMod;
  const internalMockFsExistsSync = vi.fn();
  const internalMockFsReadFileSync = vi.fn();
  const internalMockFsUnlinkSync = vi.fn();
  return {
    ...original,
    existsSync: internalMockFsExistsSync,
    readFileSync: internalMockFsReadFileSync,
    unlinkSync: internalMockFsUnlinkSync,
  };
});

describe('useShellCommandProcessor', () => {
  // These spies will point to the vi.fn() instances created by the vi.mock('fs') factory.
  let existsSyncSpy: ReturnType<typeof vi.mocked<typeof existsSync>>;
  let readFileSyncSpy: ReturnType<typeof vi.mocked<typeof readFileSync>>;
  let unlinkSyncSpy: ReturnType<typeof vi.mocked<typeof unlinkSync>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteCommand = vi.fn(); // Injected exec command mock

    // Assign the imported (and mocked by vi.mock factory) fs functions to spies
    existsSyncSpy = existsSync as unknown as ReturnType<
      typeof vi.mocked<typeof existsSync>
    >;
    readFileSyncSpy = readFileSync as unknown as ReturnType<
      typeof vi.mocked<typeof readFileSync>
    >;
    unlinkSyncSpy = unlinkSync as unknown as ReturnType<
      typeof vi.mocked<typeof unlinkSync>
    >;

    // It's important to reset these spies if they are to be configured per test
    existsSyncSpy.mockReset();
    readFileSyncSpy.mockReset();
    unlinkSyncSpy.mockReset();

    mockGetTargetDir.mockReturnValue('/current/dir');
  });

  const setupHook = () =>
    renderHook(() =>
      useShellCommandProcessor(
        mockAddItemToHistory,
        mockSetPendingHistoryItem,
        mockOnExec,
        mockOnDebugMessage,
        mockConfig,
        mockExecuteCommand as unknown as typeof ExecType, // Cast to satisfy TypeScript
      ),
    );

  it('should return false for non-string input', () => {
    const { result } = setupHook();
    const handled = result.current.handleShellCommand(
      [{ text: 'not a string' }] as PartListUnion,
      new AbortController().signal,
    );
    expect(handled).toBe(false);
    expect(mockAddItemToHistory).not.toHaveBeenCalled();
  });

  it('should handle empty shell command', () => {
    const { result } = setupHook();
    act(() => {
      const handled = result.current.handleShellCommand(
        '',
        new AbortController().signal,
      );
      expect(handled).toBe(true);
    });
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: '' },
      expect.any(Number),
    );
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'error', text: 'Empty shell command.' },
      expect.any(Number),
    );
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('should execute a successful command and add output to history', async () => {
    const { result } = setupHook();
    const command = '!ls -l';
    const stdout = 'total 0';
    const stderr = '';

    mockExecuteCommand.mockImplementation((_cmd, _options, callback) => {
      if (callback) callback(null, stdout, stderr);
      return {} as any;
    });
    existsSyncSpy.mockReturnValue(false);

    await act(async () => {
      result.current.handleShellCommand(command, new AbortController().signal);
      await new Promise(process.nextTick);
    });

    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: command },
      expect.any(Number),
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      expect.stringContaining('Executing shell command in /current/dir:'),
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      '{ !ls -l; }; __code=$?; pwd >/tmp/shell_pwd_randomBytes.tmp; exit $__code',
      { cwd: '/current/dir' },
      expect.any(Function),
    );
    expect(mockOnExec).toHaveBeenCalled();
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'info', text: stdout },
      expect.any(Number),
    );
  });

  it('should handle command with stderr output', async () => {
    const { result } = setupHook();
    const command = '!some_command_with_stderr';
    const stdout = 'some output';
    const stderr = 'some error output';

    mockExecuteCommand.mockImplementation((_cmd, _options, callback) => {
      if (callback) callback(null, stdout, stderr);
      return {} as any;
    });
    existsSyncSpy.mockReturnValue(false);

    await act(async () => {
      result.current.handleShellCommand(command, new AbortController().signal);
      await new Promise(process.nextTick);
    });
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: command },
      expect.any(Number),
    );
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'info', text: `${stdout}\n${stderr}` },
      expect.any(Number),
    );
  });

  it('should handle command with only stderr output', async () => {
    const { result } = setupHook();
    const command = '!command_only_stderr';
    const stdout = '';
    const stderr = 'just stderr';

    mockExecuteCommand.mockImplementation((_cmd, _options, callback) => {
      if (callback) callback(null, stdout, stderr);
      return {} as any;
    });
    existsSyncSpy.mockReturnValue(false);

    await act(async () => {
      result.current.handleShellCommand(command, new AbortController().signal);
      await new Promise(process.nextTick);
    });
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: command },
      expect.any(Number),
    );
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'info', text: stderr },
      expect.any(Number),
    );
  });

  it('should handle command error', async () => {
    const { result } = setupHook();
    const command = '!failing_command';
    const error = new Error('Command failed');

    mockExecuteCommand.mockImplementation((_cmd, _options, callback) => {
      if (callback) callback(error, '', '');
      return {} as any;
    });
    existsSyncSpy.mockReturnValue(false);

    await act(async () => {
      result.current.handleShellCommand(command, new AbortController().signal);
      await new Promise(process.nextTick);
    });
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: command },
      expect.any(Number),
    );
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'error', text: error.message },
      expect.any(Number),
    );
  });

  it('should correctly handle commands ending with &', async () => {
    const { result } = setupHook();
    const command = '!sleep 5 &';
    mockGetTargetDir.mockReturnValue('/current/dir');

    mockExecuteCommand.mockImplementation((_cmd, _options, callback) => {
      if (callback) callback(null, '', '');
      return {} as any;
    });
    existsSyncSpy.mockReturnValue(false);

    await act(async () => {
      result.current.handleShellCommand(command, new AbortController().signal);
      await new Promise(process.nextTick);
    });

    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      1,
      { type: 'user_shell', text: command },
      expect.any(Number),
    );
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      '{ !sleep 5 & }; __code=$?; pwd >/tmp/shell_pwd_randomBytes.tmp; exit $__code',
      { cwd: '/current/dir' },
      expect.any(Function),
    );
    expect(mockAddItemToHistory).toHaveBeenNthCalledWith(
      2,
      { type: 'info', text: '(Command produced no output)' },
      expect.any(Number),
    );
  });
});
