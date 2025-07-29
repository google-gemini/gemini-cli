/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme, CustomTheme, ThemeDebugInfo } from './theme-types.js';

/**
 * Converts a VS Code theme to a Gemini CLI custom theme
 */
export function convertVSCodeThemeToCustomTheme(vscodeTheme: VSCodeTheme): CustomTheme & { debugInfo: ThemeDebugInfo } {
  const colors = vscodeTheme.colors;
  const tokenColors = vscodeTheme.tokenColors;

  // Helper function to find color by scope
  const findColorByScope = (scope: string): string | undefined => {
    const token = tokenColors.find(t => 
      t.scope && (Array.isArray(t.scope) ? t.scope.includes(scope) : t.scope === scope)
    );
    return token?.settings.foreground;
  };

  // Helper function to get color with debug info
  const getColorWithDebug = (key: string, fallback: string, source: string): { color: string; source: string } => {
    const value = colors[key];
    if (value) {
      return { color: value, source: `Theme color: ${key}` };
    }
    return { color: fallback, source: `Default: ${source}` };
  };

  const getScopeColorWithDebug = (scope: string, fallback: string, source: string): { color: string; source: string } => {
    const value = findColorByScope(scope);
    if (value) {
      return { color: value, source: `Theme token: ${scope}` };
    }
    return { color: fallback, source: `Default: ${source}` };
  };

  // Get colors with debug info
  const backgroundInfo = getColorWithDebug('editor.background', '#1e1e1e', 'Dark background');
  const foregroundInfo = getColorWithDebug('editor.foreground', '#d4d4d4', 'Light foreground');
  const lightBlueInfo = getColorWithDebug('button.background', '#007acc', 'Blue accent');
  
  const accentBlueInfo = getScopeColorWithDebug('keyword', 
    colors['editor.findMatchBackground'] || '#007acc', 'Keyword blue');
  const accentPurpleInfo = getScopeColorWithDebug('storage.type', 
    colors['editor.lineHighlightBackground'] || '#c586c0', 'Purple accent');
  const accentCyanInfo = getScopeColorWithDebug('entity.name.class', 
    colors['editor.wordHighlightBackground'] || '#4ec9b0', 'Cyan accent');
  const accentGreenInfo = getScopeColorWithDebug('constant.numeric', 
    colors['editorGutter.addedBackground'] || '#6a9955', 'Green accent');
  const accentYellowInfo = getScopeColorWithDebug('string', 
    colors['editorGutter.modifiedBackground'] || '#ce9178', 'Yellow accent');
  const accentRedInfo = getScopeColorWithDebug('comment', 
    colors['editorGutter.deletedBackground'] || '#f44747', 'Red accent');
  const commentInfo = getScopeColorWithDebug('comment', 
    colors['editorLineNumber.foreground'] || '#6a9955', 'Comment green');
  const grayInfo = getColorWithDebug('editor.background', '#858585', 'Gray');

  // Try to get diff colors from theme first, fallback to generation
  // Check multiple VS Code diff color properties
  const diffAddedColor = colors['diffEditor.insertedTextBackground'] || 
                        colors['diffEditor.insertedTextBorder'] ||
                        colors['diffEditor.insertedText'] ||
                        colors['gitDecoration.addedResourceForeground'] ||
                        colors['gitDecoration.untrackedResourceForeground'];
  
  const diffRemovedColor = colors['diffEditor.removedTextBackground'] || 
                          colors['diffEditor.removedTextBorder'] ||
                          colors['diffEditor.removedText'] ||
                          colors['gitDecoration.deletedResourceForeground'] ||
                          colors['gitDecoration.modifiedResourceForeground'];
  
  const diffAddedInfo = diffAddedColor ? 
    { color: diffAddedColor, source: 'Theme color: diff/git colors' } :
    { color: generateDiffColor(accentGreenInfo.color, 'added'), source: 'Generated diff added' };
  
  const diffRemovedInfo = diffRemovedColor ? 
    { color: diffRemovedColor, source: 'Theme color: diff/git colors' } :
    { color: generateDiffColor(accentRedInfo.color, 'removed'), source: 'Generated diff removed' };

  // Store debug info for logging
  const debugInfo: ThemeDebugInfo = {
    themeName: generateThemeName(vscodeTheme.name || 'Imported Theme'),
    colorSources: {
      Background: backgroundInfo.source,
      Foreground: foregroundInfo.source,
      LightBlue: lightBlueInfo.source,
      AccentBlue: accentBlueInfo.source,
      AccentPurple: accentPurpleInfo.source,
      AccentCyan: accentCyanInfo.source,
      AccentGreen: accentGreenInfo.source,
      AccentYellow: accentYellowInfo.source,
      AccentRed: accentRedInfo.source,
      DiffAdded: diffAddedInfo.source,
      DiffRemoved: diffRemovedInfo.source,
      Comment: commentInfo.source,
      Gray: grayInfo.source,
    },
    colorValues: {
      Background: backgroundInfo.color,
      Foreground: foregroundInfo.color,
      LightBlue: lightBlueInfo.color,
      AccentBlue: accentBlueInfo.color,
      AccentPurple: accentPurpleInfo.color,
      AccentCyan: accentCyanInfo.color,
      AccentGreen: accentGreenInfo.color,
      AccentYellow: accentYellowInfo.color,
      AccentRed: accentRedInfo.color,
      DiffAdded: diffAddedInfo.color,
      DiffRemoved: diffRemovedInfo.color,
      Comment: commentInfo.color,
      Gray: grayInfo.color,
    }
  };

  // Map VS Code colors to Gemini CLI theme structure
  const customTheme: CustomTheme = {
    type: 'custom',
    name: debugInfo.themeName,
    Background: backgroundInfo.color,
    Foreground: foregroundInfo.color,
    LightBlue: lightBlueInfo.color,
    AccentBlue: accentBlueInfo.color,
    AccentPurple: accentPurpleInfo.color,
    AccentCyan: accentCyanInfo.color,
    AccentGreen: accentGreenInfo.color,
    AccentYellow: accentYellowInfo.color,
    AccentRed: accentRedInfo.color,
    DiffAdded: diffAddedInfo.color,
    DiffRemoved: diffRemovedInfo.color,
    Comment: commentInfo.color,
    Gray: grayInfo.color,
  };

  // Store debug info for later use
  (customTheme as any).debugInfo = debugInfo;

  return customTheme as CustomTheme & { debugInfo: ThemeDebugInfo };
}

/**
 * Generates a user-friendly theme name
 */
export function generateThemeName(originalName: string): string {
  // Remove common suffixes and prefixes
  let cleanName = originalName
    .replace(/\s*(theme|color|dark|light|theme-dark|theme-light)\s*$/i, '')
    .replace(/^(theme|color|dark|light|theme-dark|theme-light)\s+/i, '')
    .trim();
  
  // If empty after cleaning, use original
  if (!cleanName) {
    cleanName = originalName;
  }
  
  // Capitalize first letter of each word
  cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
  
  return cleanName || 'Imported Theme';
}

/**
 * Generates a diff color based on a base color
 */
export function generateDiffColor(baseColor: string, type: 'added' | 'removed'): string {
  // Convert hex to RGB for manipulation
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Create a lighter, more transparent version for diff backgrounds
  const alpha = 0.3; // 30% opacity
  const backgroundR = Math.round(r * alpha + 255 * (1 - alpha));
  const backgroundG = Math.round(g * alpha + 255 * (1 - alpha));
  const backgroundB = Math.round(b * alpha + 255 * (1 - alpha));

  return `#${backgroundR.toString(16).padStart(2, '0')}${backgroundG.toString(16).padStart(2, '0')}${backgroundB.toString(16).padStart(2, '0')}`;
} 