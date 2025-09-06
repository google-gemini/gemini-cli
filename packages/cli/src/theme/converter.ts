/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VSCodeTheme, CustomTheme } from './types.js';

/**
 * Converts a VS Code theme to a Gemini CLI custom theme
 */
export function convertVSCodeThemeToCustomTheme(
  vscodeTheme: VSCodeTheme,
): CustomTheme {
  const colors = vscodeTheme.colors;
  const tokenColors = vscodeTheme.tokenColors;

  // Helper function to find color by scope
  const findColorByScope = (scope: string): string | undefined => {
    const token = tokenColors.find(
      (t) =>
        t.scope &&
        (Array.isArray(t.scope) ? t.scope.includes(scope) : t.scope === scope),
    );
    return token?.settings.foreground;
  };

  // Helper function to get color value
  const getColor = (key: string, fallback: string): string =>
    colors[key] || fallback;

  const getScopeColor = (scope: string, fallback: string): string => {
    const value = findColorByScope(scope);
    return value || fallback;
  };

  // Extract colors from theme
  const background = getColor('editor.background', '#1e1e1e');
  const foreground = getColor('editor.foreground', '#d4d4d4');
  const lightBlue = getColor('button.background', '#007acc');

  const accentBlue = getScopeColor(
    'keyword',
    colors['editor.findMatchBackground'] || '#007acc',
  );
  const accentPurple = getScopeColor(
    'storage.type',
    colors['editor.lineHighlightBackground'] || '#c586c0',
  );
  const accentCyan = getScopeColor(
    'entity.name.class',
    colors['editor.wordHighlightBackground'] || '#4ec9b0',
  );
  const accentGreen = getScopeColor(
    'constant.numeric',
    colors['editorGutter.addedBackground'] || '#6a9955',
  );
  const accentYellow = getScopeColor(
    'string',
    colors['editorGutter.modifiedBackground'] || '#ce9178',
  );
  const accentRed = getScopeColor(
    'comment',
    colors['editorGutter.deletedBackground'] || '#f44747',
  );
  const comment = getScopeColor(
    'comment',
    colors['editorLineNumber.foreground'] || '#6a9955',
  );
  // Gray should be used for borders, frames, and inactive/unselected items (per colormap.md)
  const gray = getColor(
    'editorLineNumber.foreground',
    colors['tab.inactiveForeground'] ||
      colors['editorGroupHeader.tabsBorder'] ||
      colors['panel.border'] ||
      '#858585',
  );

  // Try to get diff colors from theme first, fallback to generation
  // Check multiple VS Code diff color properties
  const diffAddedColor =
    colors['diffEditor.insertedTextBackground'] ||
    colors['diffEditor.insertedTextBorder'] ||
    colors['diffEditor.insertedText'] ||
    colors['gitDecoration.addedResourceForeground'] ||
    colors['gitDecoration.untrackedResourceForeground'];

  const diffRemovedColor =
    colors['diffEditor.removedTextBackground'] ||
    colors['diffEditor.removedTextBorder'] ||
    colors['diffEditor.removedText'] ||
    colors['gitDecoration.deletedResourceForeground'] ||
    colors['gitDecoration.modifiedResourceForeground'];

  const diffModifiedColor =
    colors['diffEditor.modifiedTextBackground'] ||
    colors['diffEditor.modifiedTextBorder'] ||
    colors['diffEditor.modifiedText'] ||
    colors['gitDecoration.modifiedResourceForeground'] ||
    colors['editor.wordHighlightStrongBackground'];

  const diffAdded = diffAddedColor || generateDiffColor(accentGreen, 'added');
  const diffRemoved =
    diffRemovedColor || generateDiffColor(accentRed, 'removed');
  const diffModified =
    diffModifiedColor || generateDiffColor(accentBlue, 'modified');

  // Generate gradient colors based on theme's accent colors
  const gradientColors = generateGradientColors(
    accentBlue,
    accentPurple,
    accentCyan,
  );

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
    DiffModified: diffModified,
    Comment: comment,
    Gray: gray,
    GradientColors: gradientColors,
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
  cleanName = cleanName.replace(/\b\w/g, (l) => l.toUpperCase());

  return cleanName || 'Imported Theme';
}

/**
 * Generates a diff color based on a base color
 */
export function generateDiffColor(
  baseColor: string,
  _type: 'added' | 'removed' | 'modified',
): string {
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

/**
 * Generates gradient colors based on theme accent colors
 */
export function generateGradientColors(
  accentBlue: string,
  accentPurple: string,
  accentCyan: string,
): string[] {
  // Use the theme's accent colors to create a harmonious gradient
  // Order them in a visually pleasing way: blue -> purple -> cyan
  const colors = [accentBlue, accentPurple, accentCyan];

  // Filter out any undefined/null colors and ensure we have valid hex colors
  const validColors = colors.filter(
    (color) =>
      color && typeof color === 'string' && color.match(/^#[0-9a-fA-F]{6}$/),
  );

  // If we don't have enough valid colors, provide a default gradient
  if (validColors.length < 2) {
    return ['#4796E4', '#847ACE', '#C3677F'];
  }

  // If we have exactly 2 colors, add a third interpolated color
  if (validColors.length === 2) {
    const interpolated = interpolateColors(validColors[0], validColors[1]);
    return [validColors[0], interpolated, validColors[1]];
  }

  return validColors.slice(0, 3); // Use first 3 colors
}

/**
 * Interpolates between two hex colors to create a middle color
 */
function interpolateColors(color1: string, color2: string): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');

  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);

  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);

  // Calculate middle values
  const r = Math.round((r1 + r2) / 2);
  const g = Math.round((g1 + g2) / 2);
  const b = Math.round((b1 + b2) / 2);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
