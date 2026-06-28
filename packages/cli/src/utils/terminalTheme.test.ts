/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupTerminalAndTheme } from './terminalTheme.js';
import { terminalCapabilityManager } from '../ui/utils/terminalCapabilityManager.js';
import { themeManager } from '../ui/themes/theme-manager.js';
import { coreEvents, type Config } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import type { Theme } from '../ui/themes/theme.js';

vi.mock('../ui/utils/terminalCapabilityManager.js', () => ({
  terminalCapabilityManager: {
    detectCapabilities: vi.fn(),
    getTerminalBackgroundColor: vi.fn(),
  },
}));

vi.mock('../ui/themes/theme-manager.js', () => ({
  themeManager: {
    loadCustomThemes: vi.fn(),
    setActiveTheme: vi.fn(),
    getActiveTheme: vi.fn(),
    setTerminalBackground: vi.fn(),
    isThemeCompatible: vi.fn(),
    getAllThemes: vi.fn().mockReturnValue([]),
  },
  DEFAULT_THEME: { name: 'Default Dark' },
}));

vi.mock('@google/gemini-cli-core', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('setupTerminalAndTheme', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    mockConfig = {
      isInteractive: vi.fn().mockReturnValue(true),
      setTerminalBackground: vi.fn(),
    } as Partial<Config> as Config;
    mockSettings = {
      merged: {
        ui: {
          customThemes: {},
          theme: 'Dracula',
          autoThemeSwitching: true,
        },
      },
    } as Partial<LoadedSettings> as LoadedSettings;

    // Mock process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it('should emit warning when theme is incompatible and autoThemeSwitching is enabled', async () => {
    vi.mocked(
      terminalCapabilityManager.getTerminalBackgroundColor,
    ).mockReturnValue('#ffffff'); // Light
    vi.mocked(themeManager.setActiveTheme).mockReturnValue(true);
    vi.mocked(themeManager.getActiveTheme).mockReturnValue({
      name: 'Dracula',
      type: 'dark',
    } as Theme);
    vi.mocked(themeManager.isThemeCompatible).mockReturnValue(false);

    await setupTerminalAndTheme(mockConfig, mockSettings);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining(
        "Theme 'Dracula' (dark) might look incorrect on your light terminal background",
      ),
    );
  });

  it('should NOT emit warning when theme is incompatible but autoThemeSwitching is DISABLED', async () => {
    mockSettings.merged.ui.autoThemeSwitching = false;
    vi.mocked(
      terminalCapabilityManager.getTerminalBackgroundColor,
    ).mockReturnValue('#ffffff'); // Light
    vi.mocked(themeManager.setActiveTheme).mockReturnValue(true);
    vi.mocked(themeManager.getActiveTheme).mockReturnValue({
      name: 'Dracula',
      type: 'dark',
    } as Theme);
    vi.mocked(themeManager.isThemeCompatible).mockReturnValue(false);

    await setupTerminalAndTheme(mockConfig, mockSettings);

    expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
  });
});
