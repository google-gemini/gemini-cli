/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTheme } from './theme.js';
import { themeManager } from '../ui/themes/theme-manager.js';
import { type LoadedSettings } from '../config/settings.js';

vi.mock('../ui/themes/theme-manager.js', () => ({
  themeManager: {
    findThemeByName: vi.fn(),
  },
}));

describe('theme', () => {
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      merged: {
        ui: {
          themeLight: 'test-light-theme',
          themeDark: 'test-dark-theme',
        },
      },
    } as unknown as LoadedSettings;
  });

  it('should return null if themes are found', () => {
    vi.mocked(themeManager.findThemeByName).mockReturnValue(
      {} as unknown as ReturnType<typeof themeManager.findThemeByName>,
    );
    const result = validateTheme(mockSettings);
    expect(result).toBeNull();
    expect(themeManager.findThemeByName).toHaveBeenCalledWith(
      'test-light-theme',
    );
    expect(themeManager.findThemeByName).toHaveBeenCalledWith(
      'test-dark-theme',
    );
  });

  it('should return error message if light theme is not found', () => {
    vi.mocked(themeManager.findThemeByName).mockImplementation((name) => name === 'test-dark-theme'
        ? ({} as unknown as ReturnType<typeof themeManager.findThemeByName>)
        : undefined);
    const result = validateTheme(mockSettings);
    expect(result).toBe('Theme "test-light-theme" not found.');
  });

  it('should return error message if dark theme is not found', () => {
    vi.mocked(themeManager.findThemeByName).mockImplementation((name) => name === 'test-light-theme'
        ? ({} as unknown as ReturnType<typeof themeManager.findThemeByName>)
        : undefined);
    const result = validateTheme(mockSettings);
    expect(result).toBe('Theme "test-dark-theme" not found.');
  });

  it('should return null if themes are undefined', () => {
    mockSettings.merged.ui.themeLight = undefined;
    mockSettings.merged.ui.themeDark = undefined;
    const result = validateTheme(mockSettings);
    expect(result).toBeNull();
    expect(themeManager.findThemeByName).not.toHaveBeenCalled();
  });
});
