/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CSSProperties } from 'react';
import { SemanticColors } from './semantic-tokens.js';
import { resolveColor } from './color-utils.js';

export type ThemeType = 'light' | 'dark' | 'ansi' | 'custom';

export interface ColorsTheme {
  type: ThemeType;
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
  Comment: string;
  Gray: string;
  GradientColors?: string[];
}

export interface CustomTheme {
  type: 'custom';
  name: string;

  text?: {
    primary?: string;
    secondary?: string;
    link?: string;
    accent?: string;
  };
  background?: {
    primary?: string;
    diff?: {
      added?: string;
      removed?: string;
    };
  };
  border?: {
    default?: string;
    focused?: string;
  };
  ui?: {
    comment?: string;
    symbol?: string;
    gradient?: string[];
  };
  status?: {
    error?: string;
    success?: string;
    warning?: string;
  };

  // Legacy properties (all optional)
  Background?: string;
  Foreground?: string;
  LightBlue?: string;
  AccentBlue?: string;
  AccentPurple?: string;
  AccentCyan?: string;
  AccentGreen?: string;
  AccentYellow?: string;
  AccentRed?: string;
  DiffAdded?: string;
  DiffRemoved?: string;
  Comment?: string;
  Gray?: string;
  GradientColors?: string[];
}

export const lightTheme: ColorsTheme = {
  type: 'light',
  Background: '#FAFAFA',
  Foreground: '#3C3C43',
  LightBlue: '#89BDCD',
  AccentBlue: '#3B82F6',
  AccentPurple: '#8B5CF6',
  AccentCyan: '#06B6D4',
  AccentGreen: '#3CA84B',
  AccentYellow: '#D5A40A',
  AccentRed: '#DD4C4C',
  DiffAdded: '#C6EAD8',
  DiffRemoved: '#FFCCCC',
  Comment: '#008000',
  Gray: '#97a0b0',
  GradientColors: ['#4796E4', '#847ACE', '#C3677F'],
};

export const darkTheme: ColorsTheme = {
  type: 'dark',
  Background: '#1E1E2E',
  Foreground: '#CDD6F4',
  LightBlue: '#ADD8E6',
  AccentBlue: '#89B4FA',
  AccentPurple: '#CBA6F7',
  AccentCyan: '#89DCEB',
  AccentGreen: '#A6E3A1',
  AccentYellow: '#F9E2AF',
  AccentRed: '#F38BA8',
  DiffAdded: '#28350B',
  DiffRemoved: '#430000',
  Comment: '#6C7086',
  Gray: '#6C7086',
  GradientColors: ['#4796E4', '#847ACE', '#C3677F'],
};

export const ansiTheme: ColorsTheme = {
  type: 'ansi',
  Background: 'black',
  Foreground: 'white',
  LightBlue: 'blue',
  AccentBlue: 'blue',
  AccentPurple: 'magenta',
  AccentCyan: 'cyan',
  AccentGreen: 'green',
  AccentYellow: 'yellow',
  AccentRed: 'red',
  DiffAdded: 'green',
  DiffRemoved: 'red',
  Comment: 'gray',
  Gray: 'gray',
};

export class Theme {
  /**
   * The default foreground color for text when no specific highlight rule applies.
   * This is an Ink-compatible color string (hex or name).
   */
  readonly defaultColor: string;
  /**
   * Stores the mapping from highlight.js class names (e.g., 'hljs-keyword')
   * to Ink-compatible color strings (hex or name).
   */
  protected readonly _colorMap: Readonly<Record<string, string>>;

  /**
   * Creates a new Theme instance.
   * @param name The name of the theme.
   * @param rawMappings The raw CSSProperties mappings from a react-syntax-highlighter theme object.
   */
  constructor(
    readonly name: string,
    readonly type: ThemeType,
    rawMappings: Record<string, CSSProperties>,
    readonly colors: ColorsTheme,
    readonly semanticColors: SemanticColors,
  ) {
    this._colorMap = Object.freeze(this._buildColorMap(rawMappings)); // Build and freeze the map

    // Determine the default foreground color
    const rawDefaultColor = rawMappings['hljs']?.color;
    this.defaultColor =
      (rawDefaultColor ? Theme._resolveColor(rawDefaultColor) : undefined) ??
      ''; // Default to empty string if not found or resolvable
  }

  /**
   * Gets the Ink-compatible color string for a given highlight.js class name.
   * @param hljsClass The highlight.js class name (e.g., 'hljs-keyword', 'hljs-string').
   * @returns The corresponding Ink color string (hex or name) if it exists.
   */
  getInkColor(hljsClass: string): string | undefined {
    return this._colorMap[hljsClass];
  }

  /**
   * Resolves a CSS color value (name or hex) into an Ink-compatible color string.
   * @param colorValue The raw color string (e.g., 'blue', '#ff0000', 'darkkhaki').
   * @returns An Ink-compatible color string (hex or name), or undefined if not resolvable.
   */
  private static _resolveColor(colorValue: string): string | undefined {
    return resolveColor(colorValue);
  }

  /**
   * Builds the internal map from highlight.js class names to Ink-compatible color strings.
   * This method is protected and primarily intended for use by the constructor.
   * @param hljsTheme The raw CSSProperties mappings from a react-syntax-highlighter theme object.
   * @returns An Ink-compatible theme map (Record<string, string>).
   */
  protected _buildColorMap(
    hljsTheme: Record<string, CSSProperties>,
  ): Record<string, string> {
    const inkTheme: Record<string, string> = {};
    for (const key in hljsTheme) {
      // Ensure the key starts with 'hljs-' or is 'hljs' for the base style
      if (!key.startsWith('hljs-') && key !== 'hljs') {
        continue; // Skip keys not related to highlighting classes
      }

      const style = hljsTheme[key];
      if (style?.color) {
        const resolvedColor = Theme._resolveColor(style.color);
        if (resolvedColor !== undefined) {
          // Use the original key from the hljsTheme (e.g., 'hljs-keyword')
          inkTheme[key] = resolvedColor;
        }
        // If color is not resolvable, it's omitted from the map,
        // this enables falling back to the default foreground color.
      }
      // We currently only care about the 'color' property for Ink rendering.
      // Other properties like background, fontStyle, etc., are ignored.
    }
    return inkTheme;
  }
}

/**
 * Creates a Theme instance from a custom theme configuration.
 * @param customTheme The custom theme configuration.
 * @returns A new Theme instance.
 */
export function createCustomTheme(customTheme: CustomTheme): Theme {
  const colors: ColorsTheme = {
    type: 'custom',
    Background: customTheme.background?.primary ?? customTheme.Background ?? '',
    Foreground: customTheme.text?.primary ?? customTheme.Foreground ?? '',
    LightBlue: customTheme.text?.link ?? customTheme.LightBlue ?? '',
    AccentBlue: customTheme.text?.link ?? customTheme.AccentBlue ?? '',
    AccentPurple: customTheme.text?.accent ?? customTheme.AccentPurple ?? '',
    AccentCyan: customTheme.text?.link ?? customTheme.AccentCyan ?? '',
    AccentGreen: customTheme.status?.success ?? customTheme.AccentGreen ?? '',
    AccentYellow: customTheme.status?.warning ?? customTheme.AccentYellow ?? '',
    AccentRed: customTheme.status?.error ?? customTheme.AccentRed ?? '',
    DiffAdded:
      customTheme.background?.diff?.added ?? customTheme.DiffAdded ?? '',
    DiffRemoved:
      customTheme.background?.diff?.removed ?? customTheme.DiffRemoved ?? '',
    Comment: customTheme.ui?.comment ?? customTheme.Comment ?? '',
    Gray: customTheme.text?.secondary ?? customTheme.Gray ?? '',
    GradientColors: customTheme.ui?.gradient ?? customTheme.GradientColors,
  };

  // Generate CSS properties mappings based on the custom theme colors
  const rawMappings: Record<string, CSSProperties> = {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: colors.Background,
      color: colors.Foreground,
    },
    'hljs-keyword': {
      color: colors.AccentBlue,
    },
    'hljs-literal': {
      color: colors.AccentBlue,
    },
    'hljs-symbol': {
      color: colors.AccentBlue,
    },
    'hljs-name': {
      color: colors.AccentBlue,
    },
    'hljs-link': {
      color: colors.AccentBlue,
      textDecoration: 'underline',
    },
    'hljs-built_in': {
      color: colors.AccentCyan,
    },
    'hljs-type': {
      color: colors.AccentCyan,
    },
    'hljs-number': {
      color: colors.AccentGreen,
    },
    'hljs-class': {
      color: colors.AccentGreen,
    },
    'hljs-string': {
      color: colors.AccentYellow,
    },
    'hljs-meta-string': {
      color: colors.AccentYellow,
    },
    'hljs-regexp': {
      color: colors.AccentRed,
    },
    'hljs-template-tag': {
      color: colors.AccentRed,
    },
    'hljs-subst': {
      color: colors.Foreground,
    },
    'hljs-function': {
      color: colors.Foreground,
    },
    'hljs-title': {
      color: colors.Foreground,
    },
    'hljs-params': {
      color: colors.Foreground,
    },
    'hljs-formula': {
      color: colors.Foreground,
    },
    'hljs-comment': {
      color: colors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: colors.Comment,
      fontStyle: 'italic',
    },
    'hljs-doctag': {
      color: colors.Comment,
    },
    'hljs-meta': {
      color: colors.Gray,
    },
    'hljs-meta-keyword': {
      color: colors.Gray,
    },
    'hljs-tag': {
      color: colors.Gray,
    },
    'hljs-variable': {
      color: colors.AccentPurple,
    },
    'hljs-template-variable': {
      color: colors.AccentPurple,
    },
    'hljs-attr': {
      color: colors.LightBlue,
    },
    'hljs-attribute': {
      color: colors.LightBlue,
    },
    'hljs-builtin-name': {
      color: colors.LightBlue,
    },
    'hljs-section': {
      color: colors.AccentYellow,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-bullet': {
      color: colors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: colors.AccentYellow,
    },
    'hljs-selector-id': {
      color: colors.AccentYellow,
    },
    'hljs-selector-class': {
      color: colors.AccentYellow,
    },
    'hljs-selector-attr': {
      color: colors.AccentYellow,
    },
    'hljs-selector-pseudo': {
      color: colors.AccentYellow,
    },
    'hljs-addition': {
      backgroundColor: colors.AccentGreen,
      display: 'inline-block',
      width: '100%',
    },
    'hljs-deletion': {
      backgroundColor: colors.AccentRed,
      display: 'inline-block',
      width: '100%',
    },
  };

  const semanticColors: SemanticColors = {
    text: {
      primary: colors.Foreground,
      secondary: colors.Gray,
      link: colors.AccentBlue,
      accent: colors.AccentPurple,
    },
    background: {
      primary: colors.Background,
      diff: {
        added: colors.DiffAdded,
        removed: colors.DiffRemoved,
      },
    },
    border: {
      default: colors.Gray,
      focused: colors.AccentBlue,
    },
    ui: {
      comment: colors.Comment,
      symbol: colors.Gray,
      gradient: colors.GradientColors,
    },
    status: {
      error: colors.AccentRed,
      success: colors.AccentGreen,
      warning: colors.AccentYellow,
    },
  };

  return new Theme(
    customTheme.name,
    'custom',
    rawMappings,
    colors,
    semanticColors,
  );
}

/**
 * Validates a custom theme configuration.
 * @param customTheme The custom theme to validate.
 * @returns An object with isValid boolean and error message if invalid.
 */
export function validateCustomTheme(customTheme: Partial<CustomTheme>): {
  isValid: boolean;
  error?: string;
  warning?: string;
} {
  // Since all fields are optional, we only need to validate the name.
  if (customTheme.name && !isValidThemeName(customTheme.name)) {
    return {
      isValid: false,
      error: `Invalid theme name: ${customTheme.name}`,
    };
  }

  return {
    isValid: true,
  };
}

/**
 * Checks if a theme name is valid.
 * @param name The theme name to validate.
 * @returns True if the theme name is valid.
 */
function isValidThemeName(name: string): boolean {
  // Theme name should be non-empty and not contain invalid characters
  return name.trim().length > 0 && name.trim().length <= 50;
}
