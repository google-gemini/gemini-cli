/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme, ColorPalette } from './theme-types.js';
import { generateThemeName } from './theme-converter.js';

/**
 * Generates a theme using AI based on the theme name
 */
export async function generateThemeWithAI(themeName: string, signal: AbortSignal): Promise<VSCodeTheme | null> {
  try {
    // This would use the Gemini model to generate a theme based on the name
    // For now, we'll create a basic theme that matches the name
    
    const isDarkTheme = themeName.toLowerCase().includes('dark') || 
                       themeName.toLowerCase().includes('night') ||
                       themeName.toLowerCase().includes('midnight');
    
    const isLightTheme = themeName.toLowerCase().includes('light') || 
                        themeName.toLowerCase().includes('day') ||
                        themeName.toLowerCase().includes('solar');
    
    const themeType = isDarkTheme ? 'dark' : isLightTheme ? 'light' : 'dark';
    
    // Generate a color palette based on the theme name
    const palette = generateColorPaletteFromName(themeName, themeType);
    
    const aiGeneratedTheme: VSCodeTheme = {
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
    
    return aiGeneratedTheme;
  } catch (error) {
    console.error('Failed to generate theme with AI:', error);
    return null;
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

/**
 * Generates a color palette based on theme name and type
 */
export function generateColorPaletteFromName(themeName: string, themeType: 'dark' | 'light'): ColorPalette {
  // Generate colors based on theme name and type
  const name = themeName.toLowerCase();
  
  if (name.includes('nord')) {
    return themeType === 'dark' ? {
      background: '#2e3440', foreground: '#d8dee9', accent: '#5e81ac',
      highlight: '#434c5e', surface: '#3b4252', success: '#a3be8c',
      warning: '#ebcb8b', error: '#bf616a', muted: '#4c566a',
      keyword: '#81a1c1', string: '#a3be8c', comment: '#616e87',
      number: '#b48ead', class: '#8fbcbb', type: '#81a1c1'
    } : {
      background: '#eceff4', foreground: '#2e3440', accent: '#5e81ac',
      highlight: '#d8dee9', surface: '#e5e9f0', success: '#a3be8c',
      warning: '#ebcb8b', error: '#bf616a', muted: '#4c566a',
      keyword: '#5e81ac', string: '#a3be8c', comment: '#616e87',
      number: '#b48ead', class: '#8fbcbb', type: '#5e81ac'
    };
  }
  
  if (name.includes('dracula')) {
    return {
      background: '#282a36', foreground: '#f8f8f2', accent: '#bd93f9',
      highlight: '#44475a', surface: '#44475a', success: '#50fa7b',
      warning: '#ffb86c', error: '#ff5555', muted: '#6272a4',
      keyword: '#ff79c6', string: '#f1fa8c', comment: '#6272a4',
      number: '#bd93f9', class: '#8be9fd', type: '#ff79c6'
    };
  }
  
  if (name.includes('monokai')) {
    return {
      background: '#272822', foreground: '#f8f8f2', accent: '#f92672',
      highlight: '#3e3d32', surface: '#3e3d32', success: '#a6e22e',
      warning: '#e6db74', error: '#f92672', muted: '#75715e',
      keyword: '#f92672', string: '#e6db74', comment: '#75715e',
      number: '#ae81ff', class: '#a6e22e', type: '#f92672'
    };
  }
  
  // Default palette based on theme type
  return themeType === 'dark' ? {
    background: '#1e1e1e', foreground: '#d4d4d4', accent: '#007acc',
    highlight: '#264f78', surface: '#2d2d30', success: '#6a9955',
    warning: '#ce9178', error: '#f44747', muted: '#858585',
    keyword: '#569cd6', string: '#ce9178', comment: '#6a9955',
    number: '#b5cea8', class: '#4ec9b0', type: '#569cd6'
  } : {
    background: '#ffffff', foreground: '#000000', accent: '#007acc',
    highlight: '#add6ff', surface: '#f3f3f3', success: '#6a9955',
    warning: '#ce9178', error: '#f44747', muted: '#858585',
    keyword: '#0000ff', string: '#a31515', comment: '#008000',
    number: '#098658', class: '#267f99', type: '#0000ff'
  };
} 