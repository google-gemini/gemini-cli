/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { VSCodeTheme, ColorPalette } from './theme-types.js';

/**
 * Generates a theme using AI based on the theme name
 */
export async function generateThemeWithAI(themeName: string, signal: AbortSignal, config?: Config): Promise<VSCodeTheme | null> {
  try {
    if (!config) {
      console.warn('No config provided for AI theme generation, falling back to default theme');
      return createDefaultTheme(themeName);
    }

    const gemini = config.getGeminiClient();
    if (!gemini) {
      console.warn('No Gemini client available for AI theme generation, falling back to default theme');
      return createDefaultTheme(themeName);
    }

    const chat = await gemini.startChat();
    
    // First determine the theme type using AI
    const themeTypeResponse = await chat.sendMessage(
      {
        message: `Analyze this theme name: "${themeName}"
Should this be a light or dark theme? Consider:
- Direct words like 'dark', 'light', 'night', 'day'
- Theme context (e.g. 'midnight', 'solar', 'dawn')
- Common associations (e.g. 'forest' -> dark, 'beach' -> light)

Respond with just one word: "dark" or "light"`,
        config: { abortSignal: signal }
      },
      'analyze-theme-type'
    );

    const themeType = (themeTypeResponse?.text || '').trim().toLowerCase() === 'light' ? 'light' : 'dark';

    // Now generate a color palette using AI
    const paletteResponse = await chat.sendMessage(
      {
        message: `Create a color palette for a VS Code theme named "${themeName}" (${themeType} theme).
Consider the theme name's meaning and associations when choosing colors.
Provide only a JSON object with these exact color properties (all values must be valid hex colors):
{
  "background": "#...",
  "foreground": "#...",
  "accent": "#...",
  "highlight": "#...",
  "surface": "#...",
  "success": "#...",
  "warning": "#...",
  "error": "#...",
  "muted": "#...",
  "keyword": "#...",
  "string": "#...",
  "comment": "#...",
  "number": "#...",
  "class": "#...",
  "type": "#..."
}

Ensure all colors have good contrast and work well together for code readability.
For ${themeType} themes, follow these guidelines:
- dark theme: darker background (#1e-3e range), lighter foreground (>=#d0)
- light theme: lighter background (>=#f0), darker foreground (<=#2e)
- accent/token colors: must have good contrast with the background

Return only the JSON object, no explanation.`,
        config: { abortSignal: signal }
      },
      'generate-color-palette'
    );

    const paletteText = paletteResponse?.text;
    if (!paletteText) {
      console.warn('No response from AI for color palette generation');
      return createDefaultTheme(themeName);
    }

    try {
      const palette = JSON.parse(paletteText) as ColorPalette;

      // Validate all colors are hex format
      const isValidHex = (color: string) => /^#[\da-f]{6}$/i.test(color);
      for (const [key, value] of Object.entries(palette)) {
        if (typeof value !== 'string' || !isValidHex(value)) {
          console.warn(`Invalid color format for ${key}: ${value}, using default theme`);
          return createDefaultTheme(themeName);
        }
      }

      const aiTheme: VSCodeTheme = {
        name: themeName,
        type: themeType,
        colors: {
          'editor.background': palette.background,
          'editor.foreground': palette.foreground,
          'button.background': palette.accent,
          'editor.findMatchBackground': palette.highlight,
          'editor.lineHighlightBackground': palette.surface,
          'editor.wordHighlightBackground': palette.surface,
          'editorGutter.addedBackground': palette.success,
          'editorGutter.modifiedBackground': palette.warning,
          'editorGutter.deletedBackground': palette.error,
          'editorLineNumber.foreground': palette.muted,
        },
        tokenColors: [
          {
            scope: 'keyword',
            settings: { foreground: palette.keyword }
          },
          {
            scope: 'string',
            settings: { foreground: palette.string }
          },
          {
            scope: 'comment',
            settings: { foreground: palette.comment }
          },
          {
            scope: 'constant.numeric',
            settings: { foreground: palette.number }
          },
          {
            scope: 'entity.name.class',
            settings: { foreground: palette.class }
          },
          {
            scope: 'storage.type',
            settings: { foreground: palette.type }
          }
        ]
      };
      
      return aiTheme;
    } catch (error) {
      console.error('Failed to parse AI-generated color palette:', error);
      return createDefaultTheme(themeName);
    }
  } catch (error) {
    console.error('Failed to generate theme with AI:', error);
    return createDefaultTheme(themeName);
  }
}

/**
 * Creates a default theme when all other methods fail
 */
export function createDefaultTheme(themeName: string): VSCodeTheme {
  // Create a basic default theme when all other methods fail
  const defaultTheme: VSCodeTheme = {
    name: themeName,
    type: 'dark',
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'button.background': '#007acc',
      'editor.findMatchBackground': '#264f78',
      'editor.lineHighlightBackground': '#2d2d30',
      'editor.wordHighlightBackground': '#2d2d30',
      'editorGutter.addedBackground': '#6a9955',
      'editorGutter.modifiedBackground': '#ce9178',
      'editorGutter.deletedBackground': '#f44747',
      'editorLineNumber.foreground': '#858585',
    },
    tokenColors: [
      {
        scope: 'keyword',
        settings: { foreground: '#569cd6' }
      },
      {
        scope: 'string',
        settings: { foreground: '#ce9178' }
      },
      {
        scope: 'comment',
        settings: { foreground: '#6a9955' }
      },
      {
        scope: 'constant.numeric',
        settings: { foreground: '#b5cea8' }
      },
      {
        scope: 'entity.name.class',
        settings: { foreground: '#4ec9b0' }
      },
      {
        scope: 'storage.type',
        settings: { foreground: '#569cd6' }
      }
    ]
  };
  
  return defaultTheme;
} 