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
import { themeManager } from '../themes/theme-manager.js';

const mockWrite = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockHandleThemeSelect = vi.fn();
const mockQueryTerminalBackground = vi.fn();

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
    queryTerminalBackground: mockQueryTerminalBackground,
  }),
}));

const mockSettings = {
  merged: {
    ui: {
      theme: 'default', // DEFAULT_THEME.name
      autoThemeSwitching: true,
      terminalBackgroundPollingInterval: 60,
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
        name.toLowerCase() === 'default' ||
        name.toLowerCase() === 'default-light',
      setTerminalBackground: vi.fn(),
    },
    DEFAULT_THEME: { name: 'Default' },
  };
});

vi.mock('../themes/builtin/light/default-light.js', () => ({
  DefaultLight: { name: 'Default Light' },
}));

describe('useTerminalTheme', () => {
  let config: Config;

  beforeEach(() => {
    vi.useFakeTimers();
    config = makeFakeConfig({
      targetDir: os.tmpdir(),
    });
    config.setTerminalBackground('#000000');
    vi.spyOn(config, 'setTerminalBackground');

    mockWrite.mockClear();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockHandleThemeSelect.mockClear();
    mockQueryTerminalBackground.mockClear();
    vi.mocked(themeManager.setTerminalBackground).mockClear();
    mockSettings.merged.ui.autoThemeSwitching = true;
    mockSettings.merged.ui.theme = 'Default';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should subscribe to terminal background events on mount', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config, vi.fn()));
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(() =>
      useTerminalTheme(mockHandleThemeSelect, config, vi.fn()),
    );
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('should poll for terminal background', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config, vi.fn()));

    vi.advanceTimersByTime(60000);
    expect(mockQueryTerminalBackground).toHaveBeenCalled();
  });

  it('should not poll if terminal background is undefined at startup', () => {
    config.getTerminalBackground = vi.fn().mockReturnValue(undefined);
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config, vi.fn()));

    vi.advanceTimersByTime(60000);
    expect(mockQueryTerminalBackground).not.toHaveBeenCalled();
  });

  it('should switch to light theme when background is light and not call refreshStatic directly', () => {
    const refreshStatic = vi.fn();
    renderHook(() =>
      useTerminalTheme(mockHandleThemeSelect, config, refreshStatic),
    );

    const handler = mockSubscribe.mock.calls[0][0];

    handler('rgb:ffff/ffff/ffff');

    expect(config.setTerminalBackground).toHaveBeenCalledWith('#ffffff');
    expect(themeManager.setTerminalBackground).toHaveBeenCalledWith('#ffffff');
    expect(refreshStatic).not.toHaveBeenCalled();
    expect(mockHandleThemeSelect).toHaveBeenCalledWith(
      'Default Light',
      expect.anything(),
    );
  });

  it('should switch to dark theme when background is dark', () => {
    // Start with light theme
    mockSettings.merged.ui.theme = 'Default Light';

    config.setTerminalBackground('#ffffff');

    const refreshStatic = vi.fn();
    renderHook(() =>
      useTerminalTheme(mockHandleThemeSelect, config, refreshStatic),
    );

    const handler = mockSubscribe.mock.calls[0][0];

    handler('rgb:0000/0000/0000');

    expect(config.setTerminalBackground).toHaveBeenCalledWith('#000000');
    expect(themeManager.setTerminalBackground).toHaveBeenCalledWith('#000000');
    expect(refreshStatic).not.toHaveBeenCalled();
    expect(mockHandleThemeSelect).toHaveBeenCalledWith(
      'Default',
      expect.anything(),
    );

    // Reset theme
    mockSettings.merged.ui.theme = 'Default';
  });

  it('should not update config or call refreshStatic on repeated identical background reports', () => {
    const refreshStatic = vi.fn();
    renderHook(() =>
      useTerminalTheme(mockHandleThemeSelect, config, refreshStatic),
    );

    const handler = mockSubscribe.mock.calls[0][0];

    handler('rgb:0000/0000/0000');

    expect(config.setTerminalBackground).not.toHaveBeenCalled();
    expect(themeManager.setTerminalBackground).not.toHaveBeenCalled();
    expect(refreshStatic).not.toHaveBeenCalled();

    expect(mockHandleThemeSelect).not.toHaveBeenCalled();
  });

  it('should not switch theme if autoThemeSwitching is disabled', () => {
    mockSettings.merged.ui.autoThemeSwitching = false;
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config, vi.fn()));

    vi.advanceTimersByTime(60000);
    expect(mockQueryTerminalBackground).not.toHaveBeenCalled();

    mockSettings.merged.ui.autoThemeSwitching = true;
  });
});
