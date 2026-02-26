/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useSuspend } from './useSuspend.js';
import {
  writeToStdout,
  disableMouseEvents,
  enableMouseEvents,
  enterAlternateScreen,
  exitAlternateScreen,
  enableLineWrapping,
  disableLineWrapping,
} from '@google/gemini-cli-core';
import {
  cleanupTerminalOnExit,
  terminalCapabilityManager,
} from '../utils/terminalCapabilityManager.js';

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    writeToStdout: vi.fn(),
    disableMouseEvents: vi.fn(),
    enableMouseEvents: vi.fn(),
    enterAlternateScreen: vi.fn(),
    exitAlternateScreen: vi.fn(),
    enableLineWrapping: vi.fn(),
    disableLineWrapping: vi.fn(),
  };
});

vi.mock('../utils/terminalCapabilityManager.js', () => ({
  cleanupTerminalOnExit: vi.fn(),
  terminalCapabilityManager: {
    enableSupportedModes: vi.fn(),
  },
}));

describe('useSuspend', () => {
  const originalPlatform = process.platform;
  let killSpy: Mock;

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', {
      value: platform,
      configurable: true,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    killSpy = vi
      .spyOn(process, 'kill')
      .mockReturnValue(true) as unknown as Mock;
    // Default tests to a POSIX platform so suspend path assertions are stable.
    setPlatform('linux');
  });

  afterEach(() => {
    vi.useRealTimers();
    killSpy.mockRestore();
    setPlatform(originalPlatform);
  });

  it('cleans terminal state on suspend and restores/repaints on resume in alternate screen mode', () => {
    const handleWarning = vi.fn();
    const setRawMode = vi.fn();
    const refreshStatic = vi.fn();
    const setForceRerenderKey = vi.fn();
    const enableSupportedModes =
      terminalCapabilityManager.enableSupportedModes as unknown as Mock;

    const { result, unmount } = renderHook(() =>
      useSuspend({
        handleWarning,
        setRawMode,
        refreshStatic,
        setForceRerenderKey,
        shouldUseAlternateScreen: true,
      }),
    );

    act(() => {
      result.current.handleSuspend();
    });
    expect(handleWarning).toHaveBeenCalledWith(
      'Press Ctrl+Z again to suspend. Undo has moved to Cmd + Z or Alt/Opt + Z.',
    );

    act(() => {
      result.current.handleSuspend();
    });

    expect(exitAlternateScreen).toHaveBeenCalledTimes(1);
    expect(enableLineWrapping).toHaveBeenCalledTimes(1);
    expect(writeToStdout).toHaveBeenCalledWith('\x1b[2J\x1b[H');
    expect(disableMouseEvents).toHaveBeenCalledTimes(1);
    expect(cleanupTerminalOnExit).toHaveBeenCalledTimes(1);
    expect(setRawMode).toHaveBeenCalledWith(false);
    expect(killSpy).toHaveBeenCalledWith(0, 'SIGTSTP');

    act(() => {
      process.emit('SIGCONT');
      vi.runAllTimers();
    });

    expect(enterAlternateScreen).toHaveBeenCalledTimes(1);
    expect(disableLineWrapping).toHaveBeenCalledTimes(1);
    expect(enableSupportedModes).toHaveBeenCalledTimes(1);
    expect(enableMouseEvents).toHaveBeenCalledTimes(1);
    expect(setRawMode).toHaveBeenCalledWith(true);
    expect(refreshStatic).toHaveBeenCalledTimes(1);
    expect(setForceRerenderKey).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('does not toggle alternate screen or mouse restore when alternate screen mode is disabled', () => {
    const handleWarning = vi.fn();
    const setRawMode = vi.fn();
    const refreshStatic = vi.fn();
    const setForceRerenderKey = vi.fn();

    const { result, unmount } = renderHook(() =>
      useSuspend({
        handleWarning,
        setRawMode,
        refreshStatic,
        setForceRerenderKey,
        shouldUseAlternateScreen: false,
      }),
    );

    act(() => {
      result.current.handleSuspend();
      result.current.handleSuspend();
      process.emit('SIGCONT');
      vi.runAllTimers();
    });

    expect(exitAlternateScreen).not.toHaveBeenCalled();
    expect(enterAlternateScreen).not.toHaveBeenCalled();
    expect(enableLineWrapping).not.toHaveBeenCalled();
    expect(disableLineWrapping).not.toHaveBeenCalled();
    expect(enableMouseEvents).not.toHaveBeenCalled();

    unmount();
  });

  it('warns and skips suspension on windows', () => {
    setPlatform('win32');

    const handleWarning = vi.fn();
    const setRawMode = vi.fn();
    const refreshStatic = vi.fn();
    const setForceRerenderKey = vi.fn();

    const { result, unmount } = renderHook(() =>
      useSuspend({
        handleWarning,
        setRawMode,
        refreshStatic,
        setForceRerenderKey,
        shouldUseAlternateScreen: true,
      }),
    );

    act(() => {
      result.current.handleSuspend();
    });
    handleWarning.mockClear();

    act(() => {
      result.current.handleSuspend();
    });

    expect(handleWarning).toHaveBeenCalledWith(
      'Ctrl+Z suspend is not supported on Windows.',
    );
    expect(killSpy).not.toHaveBeenCalled();
    expect(cleanupTerminalOnExit).not.toHaveBeenCalled();

    unmount();
  });
});
