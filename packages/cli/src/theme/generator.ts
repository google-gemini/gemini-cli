/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { DEFAULT_GEMINI_FLASH_MODEL } from '@google/gemini-cli-core';
import type { VSCodeTheme, ColorPalette } from './types.js';

/**
 * Generates a theme using AI based on the theme name
 */
export async function generateThemeWithAI(
  themeName: string,
  signal: AbortSignal,
  config?: Config,
): Promise<VSCodeTheme | null> {
  try {
    console.log(`🤖 Attempting AI theme generation for "${themeName}"...`);

    if (!config) {
      console.warn(
        '❌ No config provided for AI theme generation, falling back to default theme',
      );
      return createDefaultTheme(themeName);
    }

    const gemini = config.getGeminiClient();
    if (!gemini) {
      console.warn(
        '❌ No Gemini client available for AI theme generation, falling back to default theme',
      );
      return createDefaultTheme(themeName);
    }
    // 1) Determine theme type using JSON mode
    console.log(
      `🤖 Determining theme type for "${themeName}" using JSON mode...`,
    );
    const THEME_TYPE_SCHEMA: Record<string, unknown> = {
      type: 'object',
      properties: {
        themeType: { type: 'string', enum: ['light', 'dark'] },
        reasoning: { type: 'string' },
      },
      required: ['themeType'],
      additionalProperties: false,
    };

    const themeTypePrompt = `Analyze this theme name: "${themeName}"
Should this be a light or dark theme? Consider:
- Direct words like 'dark', 'light', 'night', 'day'
- Theme context (e.g. 'midnight', 'solar', 'dawn')
- Common associations (e.g. 'forest' -> dark, 'beach' -> light)
Return a JSON object with { "themeType": "light" | "dark" }.`;

    let themeType: 'light' | 'dark' = 'dark';
    try {
      const themeTypeResult = (await gemini.generateJson(
        [{ role: 'user', parts: [{ text: themeTypePrompt }] }],
        THEME_TYPE_SCHEMA,
        signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      )) as unknown as { themeType?: 'light' | 'dark' };
      themeType = themeTypeResult?.themeType === 'light' ? 'light' : 'dark';
    } catch (e) {
      console.warn(
        '⚠️ Failed to get theme type from LLM, defaulting to dark.',
        e,
      );
      themeType = 'dark';
    }
    console.log(`🤖 Determined theme type: ${themeType}`);

    // 2) Generate palette using JSON mode
    console.log(
      `🤖 Generating color palette for ${themeType} theme "${themeName}" using JSON mode...`,
    );

    const HEX = '^#[0-9a-fA-F]{6}$';
    const PALETTE_SCHEMA: Record<string, unknown> = {
      type: 'object',
      properties: {
        background: { type: 'string', pattern: HEX },
        foreground: { type: 'string', pattern: HEX },
        accent: { type: 'string', pattern: HEX },
        highlight: { type: 'string', pattern: HEX },
        surface: { type: 'string', pattern: HEX },
        success: { type: 'string', pattern: HEX },
        warning: { type: 'string', pattern: HEX },
        error: { type: 'string', pattern: HEX },
        muted: { type: 'string', pattern: HEX },
        keyword: { type: 'string', pattern: HEX },
        string: { type: 'string', pattern: HEX },
        comment: { type: 'string', pattern: HEX },
        number: { type: 'string', pattern: HEX },
        class: { type: 'string', pattern: HEX },
        type: { type: 'string', pattern: HEX },
      },
      required: [
        'background',
        'foreground',
        'accent',
        'highlight',
        'surface',
        'success',
        'warning',
        'error',
        'muted',
        'keyword',
        'string',
        'comment',
        'number',
        'class',
        'type',
      ],
      additionalProperties: false,
    };

    const palettePrompt = `Create a color palette for a VS Code theme named "${themeName}" (${themeType} theme).

If the name matches a popular VS Code theme, prefer its actual colors when known:
- nord, dracula, tokyo-night, monokai, one-dark, gruvbox, solarized-dark, github, ayu, palenight

Guidelines:
- Ensure excellent readability and contrast.
- ${themeType} theme specifics:
  - dark: background roughly between #1e1e1e and #3e3e3e, foreground >= #d0d0d0
  - light: background >= #f0f0f0, foreground <= #2e2e2e
- Token colors must contrast well against background.

Return a JSON object matching the provided schema with exactly these keys.`;

    let palette: ColorPalette | null = null;
    try {
      const result = (await gemini.generateJson(
        [{ role: 'user', parts: [{ text: palettePrompt }] }],
        PALETTE_SCHEMA,
        signal,
        DEFAULT_GEMINI_FLASH_MODEL,
      )) as unknown as ColorPalette;
      palette = result;
    } catch (e) {
      console.warn('❌ Failed to get palette from LLM using JSON mode.', e);
      return createDefaultTheme(themeName);
    }

    if (!palette) {
      console.warn('❌ LLM returned empty palette object');
      return createDefaultTheme(themeName);
    }

    console.log(
      `🎨 Received AI-generated palette with ${Object.keys(palette).length} colors`,
    );

    // Validate all colors are hex format
    const isValidHex = (color: string) => /^#[\da-f]{6}$/i.test(color);
    for (const [key, value] of Object.entries(palette)) {
      if (typeof value !== 'string' || !isValidHex(value)) {
        console.warn(
          `❌ Invalid color format for ${key}: ${value}, using default theme`,
        );
        return createDefaultTheme(themeName);
      }
    }

    console.log(`✅ All colors validated successfully`);

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
          settings: { foreground: palette.keyword },
        },
        {
          scope: 'string',
          settings: { foreground: palette.string },
        },
        {
          scope: 'comment',
          settings: { foreground: palette.comment },
        },
        {
          scope: 'constant.numeric',
          settings: { foreground: palette.number },
        },
        {
          scope: 'entity.name.class',
          settings: { foreground: palette.class },
        },
        {
          scope: 'storage.type',
          settings: { foreground: palette.type },
        },
      ],
    };

    console.log(
      `✅ Successfully generated AI theme: ${aiTheme.name} (${aiTheme.type})`,
    );
    console.log(
      `🎨 AI theme has ${Object.keys(aiTheme.colors).length} colors and ${aiTheme.tokenColors.length} token colors`,
    );

    return aiTheme;
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
      'editor.background': '#1f2335',
      'editor.foreground': '#c0caf5',
      'button.background': '#7aa2f7',
      'editor.findMatchBackground': '#364a82',
      'editor.lineHighlightBackground': '#aa304aff',
      'editor.wordHighlightBackground': '#704083ff',
      'editorGutter.addedBackground': '#9ece6a',
      'editorGutter.modifiedBackground': '#e0af68',
      'editorGutter.deletedBackground': '#f7768e',
      'editorLineNumber.foreground': '#565f89',
    },
    tokenColors: [
      {
        scope: 'keyword',
        settings: { foreground: '#bb9af7' },
      },
      {
        scope: 'string',
        settings: { foreground: '#9ece6a' },
      },
      {
        scope: 'comment',
        settings: { foreground: '#565f89' },
      },
      {
        scope: 'constant.numeric',
        settings: { foreground: '#ff9e64' },
      },
      {
        scope: 'entity.name.class',
        settings: { foreground: '#7dcfff' },
      },
      {
        scope: 'storage.type',
        settings: { foreground: '#2ac3de' },
      },
    ],
  };

  return defaultTheme;
}
