/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parameters for the VS Code theme installation tool
 */
export interface InstallVSCodeThemeToolParams {
  /**
   * The VS Code marketplace URL to install the theme from
   */
  marketplaceUrl: string;
}

/**
 * VS Code theme colors interface
 */
export interface VSCodeThemeColors {
  [key: string]: string;
}

/**
 * VS Code token color interface
 */
export interface VSCodeTokenColor {
  scope?: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

/**
 * VS Code theme interface
 */
export interface VSCodeTheme {
  name: string;
  type: 'dark' | 'light';
  colors: VSCodeThemeColors;
  tokenColors: VSCodeTokenColor[];
}

/**
 * Gemini CLI custom theme structure
 */
export interface CustomTheme {
  type: 'custom';
  name: string;
  Background: string;
  Foreground: string;
  LightBlue: string;
  AccentBlue: string;
  AccentPurple: string;
  AccentCyan: string;
  AccentGreen: string;
  AccentYellow: string;
  AccentRed: string;
  DiffAdded: string;
  DiffRemoved: string;
  DiffModified: string;
  Comment: string;
  Gray: string;
  GradientColors: string[];
}

/**
 * Color palette for theme generation
 */
export interface ColorPalette {
  background: string;
  foreground: string;
  accent: string;
  highlight: string;
  surface: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
  keyword: string;
  string: string;
  comment: string;
  number: string;
  class: string;
  type: string;
}

/**
 * Debug information for theme conversion
 */
export interface ThemeDebugInfo {
  themeName: string;
  colorSources: Record<string, string>;
  colorValues: Record<string, string>;
}
