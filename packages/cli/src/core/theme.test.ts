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
          theme: 'test-theme',
        },
      },
    } as unknown as LoadedSettings;
  });

  it('should return null if theme is found', () => {
    vi.mocked(themeManager.findThemeByName).mockReturnValue(
      {} as unknown as ReturnType<typeof themeManager.findThemeByName>,
    );
    const result = validateTheme(mockSettings);
    expect(result).toBeNull();
    expect(themeManager.findThemeByName).toHaveBeenCalledWith('test-theme');
  });

  it('should return error message if theme is not found', () => {
    vi.mocked(themeManager.findThemeByName).mockReturnValue(undefined);
    const result = validateTheme(mockSettings);
    expect(result).toBe('Theme "test-theme" not found.');
    expect(themeManager.findThemeByName).toHaveBeenCalledWith('test-theme');
  });

  it('should return null if theme is undefined', () => {
    mockSettings.merged.ui.theme = undefined;
    const result = validateTheme(mockSettings);
    expect(result).toBeNull();
    expect(themeManager.findThemeByName).not.toHaveBeenCalled();
  });
});
