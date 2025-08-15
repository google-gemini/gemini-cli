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
    console.log(`🤖 Attempting AI theme generation for "${themeName}"...`);
    
    if (!config) {
      console.warn('❌ No config provided for AI theme generation, falling back to default theme');
      return createDefaultTheme(themeName);
    }

    const gemini = config.getGeminiClient();
    if (!gemini) {
      console.warn('❌ No Gemini client available for AI theme generation, falling back to default theme');
      return createDefaultTheme(themeName);
    }
    
    console.log(`🤖 Starting AI chat for theme generation...`);

    const chat = await gemini.startChat();
    
    // First determine the theme type using AI
    console.log(`🤖 Analyzing theme type for "${themeName}"...`);
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
    console.log(`🤖 Determined theme type: ${themeType}`);

    // Now generate a color palette using AI
    console.log(`🤖 Generating color palette for ${themeType} theme "${themeName}"...`);
    const paletteResponse = await chat.sendMessage(
      {
        message: `Create a color palette for a VS Code theme named "${themeName}" (${themeType} theme).

IMPORTANT: This theme name might be from a popular VS Code theme. If you recognize it, use the ACTUAL colors from that theme:

POPULAR THEMES WITH EXACT COLORS:
- "nord": background #2e3440, foreground #d8dee9, accent #5e81ac, keyword #81a1c1, string #a3be8c, comment #616e88
- "dracula": background #282a36, foreground #f8f8f2, accent #bd93f9, keyword #8be9fd, string #f1fa8c, comment #6272a4  
- "tokyo-night": background #1a1b26, foreground #a9b1d6, accent #7aa2f7, keyword #bb9af7, string #9ece6a, comment #565f89
- "monokai": background #272822, foreground #f8f8f2, accent #f92672, keyword #66d9ef, string #a6e22e, comment #75715e
- "one-dark": background #282c34, foreground #abb2bf, accent #e06c75, keyword #61afef, string #98c379, comment #5c6370
- "gruvbox": background #282828, foreground #ebdbb2, accent #fb4934, keyword #83a598, string #b8bb26, comment #928374
- "solarized-dark": background #002b36, foreground #839496, accent #268bd2, keyword #859900, string #2aa198, comment #586e75
- "github": background #ffffff, foreground #24292e, accent #0366d6, keyword #d73a49, string #032f62, comment #6a737d
- "ayu": background #0a0e14, foreground #b3b1ad, accent #e6b450, keyword #39bae6, string #c2d94c, comment #5c6773
- "palenight": background #292d3e, foreground #a6accd, accent #c792ea, keyword #82aaff, string #c3e88d, comment #676e95

If the theme name "${themeName}" matches or contains any of these popular themes, use their actual color scheme.
If it's not a known theme, create colors that match the theme name's meaning and character.

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

CRITICAL: Return ONLY the JSON object with no markdown, no code blocks, no explanation, no extra text. Just the raw JSON starting with { and ending with }.`,
        config: { abortSignal: signal }
      },
      'generate-color-palette'
    );

    const paletteText = paletteResponse?.text;
    if (!paletteText) {
      console.warn('❌ No response from AI for color palette generation');
      return createDefaultTheme(themeName);
    }

    console.log(`🤖 AI response received, parsing color palette...`);
    console.log(`🤖 Raw AI response: ${paletteText.substring(0, 200)}...`);
    
    // Extract JSON from the response (AI might return markdown or extra text)
    let jsonText = paletteText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.includes('```')) {
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
        console.log(`🤖 Extracted JSON from code block`);
      }
    }
    
    // Try to find JSON object in the response
    if (!jsonText.startsWith('{')) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
        console.log(`🤖 Extracted JSON from text`);
      }
    }
    
    console.log(`🤖 Final JSON to parse: ${jsonText.substring(0, 200)}...`);
    
    try {
      const palette = JSON.parse(jsonText) as ColorPalette;
      console.log(`🎨 Successfully parsed AI-generated palette with ${Object.keys(palette).length} colors`);

      // Validate all colors are hex format
      const isValidHex = (color: string) => /^#[\da-f]{6}$/i.test(color);
      for (const [key, value] of Object.entries(palette)) {
        if (typeof value !== 'string' || !isValidHex(value)) {
          console.warn(`❌ Invalid color format for ${key}: ${value}, using default theme`);
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
      
      console.log(`✅ Successfully generated AI theme: ${aiTheme.name} (${aiTheme.type})`);
      console.log(`🎨 AI theme has ${Object.keys(aiTheme.colors).length} colors and ${aiTheme.tokenColors.length} token colors`);
      
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