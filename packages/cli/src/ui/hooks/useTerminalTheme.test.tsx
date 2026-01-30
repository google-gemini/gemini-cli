/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '../../test-utils/render.js';
import { useTerminalTheme } from './useTerminalTheme.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeFakeConfig, type Config } from '@google/gemini-cli-core';
import os from 'node:os';

// Mocks
const mockWrite = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockHandleThemeSelect = vi.fn();
const mockSetTerminalBackground = vi.fn();

vi.mock('ink', async () => ({
  useStdout: () => ({
    stdout: {
      write: mockWrite,
    },
  }),
}));

vi.mock('../contexts/TerminalContext.js', () => ({
  useTerminalContext: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

const mockSettings = {
  merged: {
    ui: {
      theme: 'default', // DEFAULT_THEME.name
      autoThemeSwitching: true,
      terminalBackgroundPollingInterval: 100, // Short interval for testing
    },
  },
};

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: () => mockSettings,
}));

vi.mock('../themes/theme-manager.js', async () => {
  const actual = await vi.importActual('../themes/theme-manager.js');
  return {
    ...actual,
    themeManager: {
      isDefaultTheme: (name: string) =>
        name === 'default' || name === 'default-light',
    },
    DEFAULT_THEME: { name: 'default' },
  };
});

vi.mock('../themes/default-light.js', () => ({
  DefaultLight: { name: 'default-light' },
}));

describe('useTerminalTheme', () => {
  let config: Config;

  beforeEach(() => {
    vi.useFakeTimers();
    config = makeFakeConfig({
      targetDir: os.tmpdir(),
    });
    config.setTerminalBackground = mockSetTerminalBackground;
    mockWrite.mockClear();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockHandleThemeSelect.mockClear();
    mockSetTerminalBackground.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should subscribe to terminal background events on mount', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(() =>
      useTerminalTheme(mockHandleThemeSelect, config),
    );
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should poll for terminal background', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    // Fast-forward time
    vi.advanceTimersByTime(100);
    expect(mockWrite).toHaveBeenCalledWith('\x1b]11;?\x1b\\');
  });

  it('should switch to light theme when background is light', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    const handler = mockSubscribe.mock.calls[0][0];

    // Simulate light background response (white)
    // OSC 11 response format: rgb:rrrr/gggg/bbbb
    handler('rgb:ffff/ffff/ffff');

    expect(mockSetTerminalBackground).toHaveBeenCalledWith('#ffffff');
    expect(mockHandleThemeSelect).toHaveBeenCalledWith(
      'default-light',
      expect.anything(),
    );
  });

  it('should switch to dark theme when background is dark', () => {
    // Start with light theme
    mockSettings.merged.ui.theme = 'default-light';

    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    const handler = mockSubscribe.mock.calls[0][0];

    // Simulate dark background response (black)
    handler('rgb:0000/0000/0000');

    expect(mockSetTerminalBackground).toHaveBeenCalledWith('#000000');
    expect(mockHandleThemeSelect).toHaveBeenCalledWith(
      'default',
      expect.anything(),
    );

    // Reset theme
    mockSettings.merged.ui.theme = 'default';
  });

  it('should not switch theme if autoThemeSwitching is disabled', () => {
    mockSettings.merged.ui.autoThemeSwitching = false;
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    // Poll should not happen
    vi.advanceTimersByTime(100);
    expect(mockWrite).not.toHaveBeenCalled();

    mockSettings.merged.ui.autoThemeSwitching = true;
  });
});
