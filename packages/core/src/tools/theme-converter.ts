/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme, CustomTheme } from './theme-types.js';

/**
 * Converts a VS Code theme to a Gemini CLI custom theme
 */
export function convertVSCodeThemeToCustomTheme(vscodeTheme: VSCodeTheme): CustomTheme {
  const colors = vscodeTheme.colors;
  const tokenColors = vscodeTheme.tokenColors;

  // Helper function to find color by scope
  const findColorByScope = (scope: string): string | undefined => {
    const token = tokenColors.find(t => 
      t.scope && (Array.isArray(t.scope) ? t.scope.includes(scope) : t.scope === scope)
    );
    return token?.settings.foreground;
  };

  // Helper function to get color value
  const getColor = (key: string, fallback: string): string => colors[key] || fallback;

  const getScopeColor = (scope: string, fallback: string): string => {
    const value = findColorByScope(scope);
    return value || fallback;
  };

  // Extract colors from theme
  const background = getColor('editor.background', '#1e1e1e');
  const foreground = getColor('editor.foreground', '#d4d4d4');
  const lightBlue = getColor('button.background', '#007acc');
  
  const accentBlue = getScopeColor('keyword', colors['editor.findMatchBackground'] || '#007acc');
  const accentPurple = getScopeColor('storage.type', colors['editor.lineHighlightBackground'] || '#c586c0');
  const accentCyan = getScopeColor('entity.name.class', colors['editor.wordHighlightBackground'] || '#4ec9b0');
  const accentGreen = getScopeColor('constant.numeric', colors['editorGutter.addedBackground'] || '#6a9955');
  const accentYellow = getScopeColor('string', colors['editorGutter.modifiedBackground'] || '#ce9178');
  const accentRed = getScopeColor('comment', colors['editorGutter.deletedBackground'] || '#f44747');
  const comment = getScopeColor('comment', colors['editorLineNumber.foreground'] || '#6a9955');
  const gray = getColor('editor.background', '#858585');

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
  
  const diffAdded = diffAddedColor || generateDiffColor(accentGreen, 'added');
  const diffRemoved = diffRemovedColor || generateDiffColor(accentRed, 'removed');

  // Map VS Code colors to Gemini CLI theme structure
  const customTheme: CustomTheme = {
    type: 'custom',
    name: generateThemeName(vscodeTheme.name || 'Imported Theme'),
    Background: background,
    Foreground: foreground,
    LightBlue: lightBlue,
    AccentBlue: accentBlue,
    AccentPurple: accentPurple,
    AccentCyan: accentCyan,
    AccentGreen: accentGreen,
    AccentYellow: accentYellow,
    AccentRed: accentRed,
    DiffAdded: diffAdded,
    DiffRemoved: diffRemoved,
    Comment: comment,
    Gray: gray,
  };

  return customTheme;
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
export function generateDiffColor(baseColor: string, _type: 'added' | 'removed'): string {
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
