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
      terminalBackgroundPollingInterval: 1, // 1 second
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
    // Reset any settings modifications
    mockSettings.merged.ui.autoThemeSwitching = true;
    mockSettings.merged.ui.theme = 'default';
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

    // Fast-forward time (1 second)
    vi.advanceTimersByTime(1000);
    expect(mockWrite).toHaveBeenCalledWith('\x1b]11;?\x1b\\');
  });

  it('should stop polling after 3 unacknowledged attempts', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    // Attempt 1
    vi.advanceTimersByTime(1000);
    expect(mockWrite).toHaveBeenCalledTimes(1);

    // Attempt 2
    vi.advanceTimersByTime(1000);
    expect(mockWrite).toHaveBeenCalledTimes(2);

    // Attempt 3
    vi.advanceTimersByTime(1000);
    expect(mockWrite).toHaveBeenCalledTimes(3);

    // Attempt 4 (should be blocked)
    vi.advanceTimersByTime(1000);
    expect(mockWrite).toHaveBeenCalledTimes(3);
  });

  it('should reset failure count after successful response', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    const handler = mockSubscribe.mock.calls[0][0];

    // Fail twice
    vi.advanceTimersByTime(1000); // 1
    vi.advanceTimersByTime(1000); // 2
    expect(mockWrite).toHaveBeenCalledTimes(2);

    // Succeed
    handler('rgb:ffff/ffff/ffff');

    // Should continue polling
    vi.advanceTimersByTime(1000); // 3 (reset count, so this is new attempt 1)
    expect(mockWrite).toHaveBeenCalledTimes(3);

    // Fail 3 times from now
    vi.advanceTimersByTime(1000); // 4 (new attempt 2)
    vi.advanceTimersByTime(1000); // 5 (new attempt 3)
    vi.advanceTimersByTime(1000); // 6 (new attempt 4 - blocked?)

    // Total calls: 3 (before success) + 3 (after success) = 6.
    // Wait, attempt 3 was the one after success.
    // Let's trace carefully:
    // 1. Poll (0->1)
    // 2. Poll (1->2)
    // <Success> (Reset to 0)
    // 3. Poll (0->1)
    // 4. Poll (1->2)
    // 5. Poll (2->3)
    // 6. Blocked (3->3)
    // Total expecting 5 calls? No, 3 before success?
    // Initial: 0.
    // T=1000: Write (Polls=1). Calls=1.
    // T=2000: Write (Polls=2). Calls=2.
    // Handler called. Polls=0.
    // T=3000: Write (Polls=1). Calls=3.
    // T=4000: Write (Polls=2). Calls=4.
    // T=5000: Write (Polls=3). Calls=5.
    // T=6000: Blocked. Calls=5.

    expect(mockWrite).toHaveBeenCalledTimes(5);
  });

  it('should switch to light theme when background is light', () => {
    renderHook(() => useTerminalTheme(mockHandleThemeSelect, config));

    const handler = mockSubscribe.mock.calls[0][0];

    // Simulate light background response (white)
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
    vi.advanceTimersByTime(1000);
    expect(mockWrite).not.toHaveBeenCalled();

    mockSettings.merged.ui.autoThemeSwitching = true;
  });
});
