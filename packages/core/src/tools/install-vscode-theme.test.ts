/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstallVSCodeThemeTool } from './install-vscode-theme.js';
import { Config } from '../config/config.js';
import { extractExtensionId } from './theme-extractor.js';
import { convertVSCodeThemeToCustomTheme } from './theme-converter.js';

// Mock the Config class
const mockConfig = {
  getProxy: vi.fn(),
} as unknown as Config;

describe('InstallVSCodeThemeTool', () => {
  let tool: InstallVSCodeThemeTool;

  beforeEach(() => {
    tool = new InstallVSCodeThemeTool(mockConfig);
  });

  describe('validateToolParams', () => {
    it('should return null for valid marketplace URL', () => {
      const result = tool.validateToolParams({
        marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=test.theme'
      });
      expect(result).toBeNull();
    });

    it('should return error for missing URL', () => {
      const result = tool.validateToolParams({
        marketplaceUrl: ''
      });
      expect(result).toBe('Marketplace URL is required');
    });

    it('should return error for non-marketplace URL', () => {
      const result = tool.validateToolParams({
        marketplaceUrl: 'https://example.com/theme'
      });
      expect(result).toBe('URL must be a valid VS Code marketplace URL');
    });
  });

  describe('getDescription', () => {
    it('should return description with marketplace URL', () => {
      const result = tool.getDescription({
        marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=test.theme'
      });
      expect(result).toBe('Install VS Code theme from marketplace URL: https://marketplace.visualstudio.com/items?itemName=test.theme');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details', async () => {
      const result = await tool.shouldConfirmExecute({
        marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=test.theme'
      });

      expect(result).toEqual({
        type: 'info',
        title: 'Install VS Code Theme',
        prompt: expect.stringContaining('This will install a VS Code theme from the marketplace URL'),
        onConfirm: expect.any(Function),
      });
    });
  });

  describe('toolLocations', () => {
    it('should return settings file location', () => {
      const result = tool.toolLocations({
        marketplaceUrl: 'https://marketplace.visualstudio.com/items?itemName=test.theme'
      });

      expect(result).toHaveLength(1);
      expect(result[0].path).toContain('.gemini/settings.json');
    });
  });

  describe('extractExtensionId', () => {
    it('should extract publisher and name from marketplace URL', () => {
      const result = extractExtensionId(
        'https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code'
      );

      expect(result).toEqual({
        publisher: 'arcticicestudio',
        name: 'nord-visual-studio-code'
      });
    });

    it('should handle complex publisher names', () => {
      const result = extractExtensionId(
        'https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-next'
      );

      expect(result).toEqual({
        publisher: 'ms-vscode',
        name: 'vscode-typescript-next'
      });
    });

    it('should return null for invalid URL', () => {
      const result = extractExtensionId('https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('convertVSCodeThemeToCustomTheme', () => {
    it('should convert VS Code theme to custom theme with debug info', () => {
      const vscodeTheme = {
        name: 'Test Theme',
        type: 'dark' as const,
        colors: {
          'editor.background': '#1e1e1e',
          'editor.foreground': '#d4d4d4',
          'button.background': '#007acc',
        },
        tokenColors: [
          {
            scope: 'keyword',
            settings: { foreground: '#569cd6' }
          },
          {
            scope: 'string',
            settings: { foreground: '#ce9178' }
          }
        ]
      };

      const result = convertVSCodeThemeToCustomTheme(vscodeTheme);

      // Check basic theme structure
      expect(result.type).toBe('custom');
      expect(result.name).toBe('Test');
      expect(result.Background).toBe('#1e1e1e');
      expect(result.Foreground).toBe('#d4d4d4');
      expect(result.LightBlue).toBe('#007acc');
      expect(result.AccentBlue).toBe('#569cd6');
      expect(result.AccentPurple).toBe('#c586c0');
      expect(result.AccentCyan).toBe('#4ec9b0');
      expect(result.AccentGreen).toBe('#6a9955');
      expect(result.AccentYellow).toBe('#ce9178');
      expect(result.AccentRed).toBe('#f44747');
      expect(result.DiffAdded).toBeDefined();
      expect(result.DiffRemoved).toBeDefined();
      expect(result.Comment).toBe('#6a9955');
      expect(result.Gray).toBe('#1e1e1e');

      // Check debug info is included
      expect(result.debugInfo).toBeDefined();
      expect(result.debugInfo.themeName).toBe('Test');
      expect(result.debugInfo.colorSources).toBeDefined();
      expect(result.debugInfo.colorSources.Background).toBe('Theme color: editor.background');
      expect(result.debugInfo.colorSources.AccentBlue).toBe('Theme token: keyword');
    });

    it('should generate clean theme names', () => {
      const vscodeTheme = {
        name: 'Nord Visual Studio Code Theme Dark',
        type: 'dark' as const,
        colors: {},
        tokenColors: []
      };

      const result = convertVSCodeThemeToCustomTheme(vscodeTheme);
      expect(result.name).toBe('Nord Visual Studio Code Theme');
    });
  });
}); 