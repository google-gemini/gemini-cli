/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useShellCommandProcessor } from './shellCommandProcessor';
import { Config, GeminiClient } from '@google/gemini-cli-core';
import * as fs from 'fs';
import EventEmitter from 'events';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('os', () => ({
  default: {
    platform: () => 'linux',
    tmpdir: () => '/tmp',
  },
  platform: () => 'linux',
  tmpdir: () => '/tmp',
}));
vi.mock('@google/gemini-cli-core');
vi.mock('../utils/textUtils.js', () => ({
  isBinary: vi.fn(),
}));

describe('useShellCommandProcessor', () => {
  let spawnEmitter: EventEmitter;
  let addItemToHistoryMock: vi.Mock;
  let setPendingHistoryItemMock: vi.Mock;
  let onExecMock: vi.Mock;
  let onDebugMessageMock: vi.Mock;
  let configMock: Config;
  let geminiClientMock: GeminiClient;

  beforeEach(async () => {
    const { spawn } = await import('child_process');
    spawnEmitter = new EventEmitter();
    spawnEmitter.stdout = new EventEmitter();
    spawnEmitter.stderr = new EventEmitter();
    (spawn as vi.Mock).mockReturnValue(spawnEmitter);

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

  it('should handle binary output', async () => {
    const { result } = renderProcessorHook();
    const abortController = new AbortController();
    const { isBinary } = await import('../utils/textUtils.js');
    (isBinary as vi.Mock).mockReturnValue(true);

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
});
