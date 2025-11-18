/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Colors } from './colors.js';
import * as themeManagerModule from './themes/theme-manager.js';

vi.mock('./themes/theme-manager.js');

describe('Colors', () => {
  const mockColors = {
    type: 'dark',
    Foreground: '#FFFFFF',
    Background: '#000000',
    LightBlue: '#89CFF0',
    AccentBlue: '#0066CC',
    AccentPurple: '#9933FF',
    AccentCyan: '#00FFFF',
    AccentGreen: '#00FF00',
    AccentYellow: '#FFFF00',
    AccentRed: '#FF0000',
    DiffAdded: '#00AA00',
    DiffRemoved: '#AA0000',
    Comment: '#666666',
    Gray: '#808080',
    GradientColors: ['#FF0000', '#00FF00', '#0000FF'],
  };

  beforeEach(() => {
    vi.mocked(themeManagerModule.themeManager.getActiveTheme).mockReturnValue({
      colors: mockColors,
    } as never);
  });

  describe('color properties', () => {
    it('should have type property', () => {
      expect(Colors.type).toBeDefined();
    });

    it('should have Foreground property', () => {
      expect(Colors.Foreground).toBeDefined();
    });

    it('should have Background property', () => {
      expect(Colors.Background).toBeDefined();
    });

    it('should have LightBlue property', () => {
      expect(Colors.LightBlue).toBeDefined();
    });

    it('should have AccentBlue property', () => {
      expect(Colors.AccentBlue).toBeDefined();
    });

    it('should have AccentPurple property', () => {
      expect(Colors.AccentPurple).toBeDefined();
    });

    it('should have AccentCyan property', () => {
      expect(Colors.AccentCyan).toBeDefined();
    });

    it('should have AccentGreen property', () => {
      expect(Colors.AccentGreen).toBeDefined();
    });

    it('should have AccentYellow property', () => {
      expect(Colors.AccentYellow).toBeDefined();
    });

    it('should have AccentRed property', () => {
      expect(Colors.AccentRed).toBeDefined();
    });

    it('should have DiffAdded property', () => {
      expect(Colors.DiffAdded).toBeDefined();
    });

    it('should have DiffRemoved property', () => {
      expect(Colors.DiffRemoved).toBeDefined();
    });

    it('should have Comment property', () => {
      expect(Colors.Comment).toBeDefined();
    });

    it('should have Gray property', () => {
      expect(Colors.Gray).toBeDefined();
    });

    it('should have GradientColors property', () => {
      expect(Colors.GradientColors).toBeDefined();
    });
  });

  describe('color values from theme manager', () => {
    it('should get type from theme', () => {
      expect(Colors.type).toBe('dark');
    });

    it('should get Foreground from theme', () => {
      expect(Colors.Foreground).toBe('#FFFFFF');
    });

    it('should get Background from theme', () => {
      expect(Colors.Background).toBe('#000000');
    });

    it('should get LightBlue from theme', () => {
      expect(Colors.LightBlue).toBe('#89CFF0');
    });

    it('should get AccentBlue from theme', () => {
      expect(Colors.AccentBlue).toBe('#0066CC');
    });

    it('should get AccentPurple from theme', () => {
      expect(Colors.AccentPurple).toBe('#9933FF');
    });

    it('should get AccentCyan from theme', () => {
      expect(Colors.AccentCyan).toBe('#00FFFF');
    });

    it('should get AccentGreen from theme', () => {
      expect(Colors.AccentGreen).toBe('#00FF00');
    });

    it('should get AccentYellow from theme', () => {
      expect(Colors.AccentYellow).toBe('#FFFF00');
    });

    it('should get AccentRed from theme', () => {
      expect(Colors.AccentRed).toBe('#FF0000');
    });

    it('should get DiffAdded from theme', () => {
      expect(Colors.DiffAdded).toBe('#00AA00');
    });

    it('should get DiffRemoved from theme', () => {
      expect(Colors.DiffRemoved).toBe('#AA0000');
    });

    it('should get Comment from theme', () => {
      expect(Colors.Comment).toBe('#666666');
    });

    it('should get Gray from theme', () => {
      expect(Colors.Gray).toBe('#808080');
    });

    it('should get GradientColors from theme', () => {
      expect(Colors.GradientColors).toEqual(['#FF0000', '#00FF00', '#0000FF']);
    });
  });

  describe('dynamic theme updates', () => {
    it('should reflect changes when theme updates', () => {
      const newColors = {
        ...mockColors,
        Foreground: '#000000',
        Background: '#FFFFFF',
      };

      vi.mocked(themeManagerModule.themeManager.getActiveTheme).mockReturnValue(
        {
          colors: newColors,
        } as never,
      );

      expect(Colors.Foreground).toBe('#000000');
      expect(Colors.Background).toBe('#FFFFFF');
    });

    it('should call getActiveTheme each time a property is accessed', () => {
      vi.clearAllMocks();

      const _ = Colors.type;
      expect(
        themeManagerModule.themeManager.getActiveTheme,
      ).toHaveBeenCalledTimes(1);

      const __ = Colors.Foreground;
      expect(
        themeManagerModule.themeManager.getActiveTheme,
      ).toHaveBeenCalledTimes(2);
    });

    it('should support switching between light and dark themes', () => {
      const lightColors = { ...mockColors, type: 'light' };
      vi.mocked(themeManagerModule.themeManager.getActiveTheme).mockReturnValue(
        {
          colors: lightColors,
        } as never,
      );

      expect(Colors.type).toBe('light');

      const darkColors = { ...mockColors, type: 'dark' };
      vi.mocked(themeManagerModule.themeManager.getActiveTheme).mockReturnValue(
        {
          colors: darkColors,
        } as never,
      );

      expect(Colors.type).toBe('dark');
    });
  });

  describe('color categories', () => {
    it('should have accent colors', () => {
      expect(Colors.AccentBlue).toBeDefined();
      expect(Colors.AccentPurple).toBeDefined();
      expect(Colors.AccentCyan).toBeDefined();
      expect(Colors.AccentGreen).toBeDefined();
      expect(Colors.AccentYellow).toBeDefined();
      expect(Colors.AccentRed).toBeDefined();
    });

    it('should have diff colors', () => {
      expect(Colors.DiffAdded).toBeDefined();
      expect(Colors.DiffRemoved).toBeDefined();
    });

    it('should have basic colors', () => {
      expect(Colors.Foreground).toBeDefined();
      expect(Colors.Background).toBeDefined();
    });

    it('should have utility colors', () => {
      expect(Colors.Comment).toBeDefined();
      expect(Colors.Gray).toBeDefined();
      expect(Colors.LightBlue).toBeDefined();
    });
  });

  describe('getter implementation', () => {
    it('should use getters for all properties', () => {
      const descriptors = Object.getOwnPropertyDescriptors(Colors);

      expect(descriptors.type.get).toBeDefined();
      expect(descriptors.Foreground.get).toBeDefined();
      expect(descriptors.Background.get).toBeDefined();
      expect(descriptors.AccentBlue.get).toBeDefined();
    });

    it('should not have setter methods', () => {
      const descriptors = Object.getOwnPropertyDescriptors(Colors);

      expect(descriptors.type.set).toBeUndefined();
      expect(descriptors.Foreground.set).toBeUndefined();
      expect(descriptors.Background.set).toBeUndefined();
    });
  });

  describe('gradient colors', () => {
    it('should return array of colors', () => {
      expect(Array.isArray(Colors.GradientColors)).toBe(true);
    });

    it('should have multiple gradient colors', () => {
      expect(Colors.GradientColors.length).toBeGreaterThan(0);
    });
  });
});
