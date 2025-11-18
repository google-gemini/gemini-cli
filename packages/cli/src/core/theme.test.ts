/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { validateTheme } from './theme.js';
import type { LoadedSettings } from '../config/settings.js';
import * as themeManagerModule from '../ui/themes/theme-manager.js';

vi.mock('../ui/themes/theme-manager.js');

describe('validateTheme', () => {
  it('should return null when no theme is configured', () => {
    const settings: LoadedSettings = {
      merged: {},
    } as LoadedSettings;

    const result = validateTheme(settings);

    expect(result).toBeNull();
  });

  it('should return null when ui section has no theme', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {},
      },
    } as LoadedSettings;

    const result = validateTheme(settings);

    expect(result).toBeNull();
  });

  it('should return null when theme is found', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: 'dark',
        },
      },
    } as LoadedSettings;

    vi.mocked(themeManagerModule.themeManager.findThemeByName).mockReturnValue(
      {} as never,
    );

    const result = validateTheme(settings);

    expect(result).toBeNull();
  });

  it('should return error message when theme is not found', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: 'nonexistent-theme',
        },
      },
    } as LoadedSettings;

    vi.mocked(themeManagerModule.themeManager.findThemeByName).mockReturnValue(
      null,
    );

    const result = validateTheme(settings);

    expect(result).toBe('Theme "nonexistent-theme" not found.');
  });

  it('should include theme name in error message', () => {
    const themeName = 'my-custom-theme';
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: themeName,
        },
      },
    } as LoadedSettings;

    vi.mocked(themeManagerModule.themeManager.findThemeByName).mockReturnValue(
      null,
    );

    const result = validateTheme(settings);

    expect(result).toContain(themeName);
    expect(result).toBe(`Theme "${themeName}" not found.`);
  });

  it('should call findThemeByName with correct theme name', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: 'light',
        },
      },
    } as LoadedSettings;

    vi.mocked(themeManagerModule.themeManager.findThemeByName).mockReturnValue(
      {} as never,
    );

    validateTheme(settings);

    expect(
      themeManagerModule.themeManager.findThemeByName,
    ).toHaveBeenCalledWith('light');
  });

  it('should not call findThemeByName when theme is not configured', () => {
    const settings: LoadedSettings = {
      merged: {},
    } as LoadedSettings;

    validateTheme(settings);

    expect(
      themeManagerModule.themeManager.findThemeByName,
    ).not.toHaveBeenCalled();
  });

  it('should handle empty theme name', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: '',
        },
      },
    } as LoadedSettings;

    const result = validateTheme(settings);

    expect(result).toBeNull();
  });

  it('should handle undefined theme gracefully', () => {
    const settings: LoadedSettings = {
      merged: {
        ui: {
          theme: undefined,
        },
      },
    } as LoadedSettings;

    const result = validateTheme(settings);

    expect(result).toBeNull();
  });
});
