/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderColorValue, createColorMappingDisplay, createColorPalettePreview } from './theme-display.js';
import type { ThemeDebugInfo } from './theme-types.js';

describe('Theme Display', () => {
  describe('renderColorValue', () => {
    it('should render a color value', () => {
      const result = renderColorValue('#ff0000', 'Red');
      expect(result).toContain('#ff0000');
      expect(result).toContain('Red');
    });

    it('should handle different colors', () => {
      const result = renderColorValue('#00ff00', 'Green');
      expect(result).toContain('#00ff00');
      expect(result).toContain('Green');
    });
  });

  describe('createColorMappingDisplay', () => {
    it('should create a formatted color mapping display', () => {
      const debugInfo: ThemeDebugInfo = {
        themeName: 'Test Theme',
        colorSources: {
          Background: 'Theme color: editor.background',
          Foreground: 'Theme color: editor.foreground',
          LightBlue: 'Default: Blue accent',
        },
        colorValues: {
          Background: '#1e1e1e',
          Foreground: '#d4d4d4',
          LightBlue: '#007acc',
        }
      };

      const result = createColorMappingDisplay(debugInfo);
      expect(result).toContain('Background');
      expect(result).toContain('Foreground');
      expect(result).toContain('LightBlue');
      expect(result).toContain('#1e1e1e');
      expect(result).toContain('#d4d4d4');
      expect(result).toContain('#007acc');
    });
  });

  describe('createColorPalettePreview', () => {
    it('should create a color palette preview', () => {
      const debugInfo: ThemeDebugInfo = {
        themeName: 'Test Theme',
        colorSources: {
          Background: 'Theme color: editor.background',
          Foreground: 'Theme color: editor.foreground',
          LightBlue: 'Default: Blue accent',
          AccentBlue: 'Theme token: keyword',
          AccentPurple: 'Default: Purple accent',
          AccentCyan: 'Default: Cyan accent',
          AccentGreen: 'Default: Green accent',
          AccentYellow: 'Default: Yellow accent',
          AccentRed: 'Default: Red accent',
          DiffAdded: 'Generated diff added',
          DiffRemoved: 'Generated diff removed',
          Comment: 'Default: Comment green',
          Gray: 'Default: Gray',
        },
        colorValues: {
          Background: '#1e1e1e',
          Foreground: '#d4d4d4',
          LightBlue: '#007acc',
          AccentBlue: '#569cd6',
          AccentPurple: '#c586c0',
          AccentCyan: '#4ec9b0',
          AccentGreen: '#6a9955',
          AccentYellow: '#ce9178',
          AccentRed: '#f44747',
          DiffAdded: '#6a9955',
          DiffRemoved: '#f44747',
          Comment: '#6a9955',
          Gray: '#858585',
        }
      };

      const result = createColorPalettePreview(debugInfo);
      expect(result).toContain('🎨 **Color Palette Preview:**');
      expect(result).toContain('Background');
      expect(result).toContain('Foreground');
      expect(result).toContain('LightBlue');
      expect(result).toContain('AccentBlue');
    });
  });
}); 