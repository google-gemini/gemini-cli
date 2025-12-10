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
        sound: 'Glass',
        wait: true,
        icon: expect.any(String),
        contentImage: expect.any(String),
      }),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      expect.not.objectContaining({
        activate: expect.anything(),
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
        sound: true,
        wait: true,
        icon: expect.any(String),
        contentImage: expect.any(String),
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

  it('should include activate option for Warp on macOS', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    process.env['TERM_PROGRAM'] = 'WarpTerminal';
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
});
