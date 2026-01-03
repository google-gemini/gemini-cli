/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import notifier from 'node-notifier';
import { useNotification } from './useNotification.js';
import { StreamingState } from '../types.js';
import type { Settings } from '../../config/settingsSchema.js';
import process from 'node:process';

vi.mock('node-notifier', () => ({
  default: {
    notify: vi.fn(),
  },
}));

describe('useNotification', () => {
  const mockNotify = notifier.notify as unknown as ReturnType<typeof vi.fn>;
  const originalPlatform = process.platform;
  const originalEnvTermProgram = process.env['TERM_PROGRAM'];
  const originalEnvBundleId = process.env['__CFBundleIdentifier'];

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    delete process.env['TERM_PROGRAM'];
    delete process.env['__CFBundleIdentifier'];
  });

  afterEach(() => {
    process.env['TERM_PROGRAM'] = originalEnvTermProgram;
    process.env['__CFBundleIdentifier'] = originalEnvBundleId;
  });

  /**
   * Helper to create a partial Settings object with just the notification setting.
   */
  const createSettings = (enableNotifications: boolean): Settings =>
    ({
      ui: {
        enableNotifications,
      },
    }) as Settings;

  it('should notify when waiting for confirmation, not focused, and enabled on macOS', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    delete process.env['TERM_PROGRAM'];
    delete process.env['__CFBundleIdentifier'];

    const settings = createSettings(true);
    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Gemini CLI',
        message: 'Requires Permission to Execute Command',
        sound: false,
        wait: false,
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.not.objectContaining({
        activate: expect.anything(),
        contentImage: expect.anything(),
      }),
    );
  });

  it('should notify when waiting for confirmation, not focused, and enabled on Linux', () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    const settings = createSettings(true);
    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Gemini CLI',
        message: 'Requires Permission to Execute Command',
        sound: false,
        wait: false,
      }),
    );
  });

  it('should NOT notify if disabled', () => {
    const settings = createSettings(false);
    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should NOT notify if focused', () => {
    const settings = createSettings(true);
    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, true, settings),
    );

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should NOT notify if not waiting for confirmation', () => {
    const settings = createSettings(true);
    renderHook(() =>
      useNotification(StreamingState.Responding, false, settings),
    );

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('should include activate option for VS Code on macOS', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'vscode';
    process.env['__CFBundleIdentifier'] = 'com.microsoft.VSCode';
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.microsoft.VSCode',
      }),
    );
  });

  it('should include activate option for WarpTerminal on macOS', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'WarpTerminal';
    process.env['__CFBundleIdentifier'] = 'dev.warp.Warp';
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'dev.warp.Warp',
      }),
    );
  });

  it('should notify in unsupported terminal (Warp) even if focused', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'WarpTerminal';
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, true, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Gemini CLI',
        message: 'Requires Permission to Execute Command',
        wait: false,
      }),
    );
  });

  it('should include activate option from __CFBundleIdentifier', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['__CFBundleIdentifier'] = 'com.custom.app';
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.custom.app',
      }),
    );
  });

  it('should prioritize __CFBundleIdentifier over TERM_PROGRAM', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'vscode';
    process.env['__CFBundleIdentifier'] = 'com.custom.app';
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        activate: 'com.custom.app',
      }),
    );
  });

  it('should not include activate option if unknown terminal', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'UnknownTerminal';
    delete process.env['__CFBundleIdentifier'];
    const settings = createSettings(true);

    renderHook(() =>
      useNotification(StreamingState.WaitingForConfirmation, false, settings),
    );

    expect(mockNotify).toHaveBeenCalledWith(
      expect.not.objectContaining({
        activate: expect.anything(),
      }),
    );
  });

  it('should not notify multiple times for the same confirmation event when focus toggles', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const settings = createSettings(true);
    const { rerender } = renderHook(
      ({ state, focused }) => useNotification(state, focused, settings),
      {
        initialProps: {
          state: StreamingState.WaitingForConfirmation,
          focused: false,
        },
      },
    );

    // First render: Waiting + Not Focused -> Notify
    expect(mockNotify).toHaveBeenCalledTimes(1);

    // Rerender: Waiting + Focused -> No new notification
    rerender({ state: StreamingState.WaitingForConfirmation, focused: true });
    expect(mockNotify).toHaveBeenCalledTimes(1);

    // Rerender: Waiting + Not Focused again -> Should NOT notify again
    rerender({ state: StreamingState.WaitingForConfirmation, focused: false });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('should notify again if state changes to something else then back to Waiting', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    const settings = createSettings(true);
    const { rerender } = renderHook(
      ({ state, focused }) => useNotification(state, focused, settings),
      {
        initialProps: {
          state: StreamingState.WaitingForConfirmation,
          focused: false,
        },
      },
    );

    expect(mockNotify).toHaveBeenCalledTimes(1);

    // State changes to responding
    rerender({ state: StreamingState.Responding, focused: false });

    // State changes back to Waiting + Not Focused -> Notify again
    rerender({ state: StreamingState.WaitingForConfirmation, focused: false });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });
});
