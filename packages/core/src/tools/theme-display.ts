/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ThemeDebugInfo } from './theme-types.js';

/**
 * Renders a color value for terminal display
 */
export function renderColorValue(color: string, label: string): string {
  return `${color} ${label}`;
}



/**
 * Creates a formatted color mapping display with visual color blocks
 */
export function createColorMappingDisplay(debugInfo: ThemeDebugInfo): string {
  const colorOrder = [
    'Background', 'Foreground', 'LightBlue', 'AccentBlue', 
    'AccentPurple', 'AccentCyan', 'AccentGreen', 'AccentYellow', 
    'AccentRed', 'DiffAdded', 'DiffRemoved', 'Comment', 'Gray'
  ];

  const colorLines = colorOrder.map(colorKey => {
    const color = debugInfo.colorValues[colorKey];
    const source = debugInfo.colorSources[colorKey];
    const colorValue = renderColorValue(color, colorKey);
    return `  • ${colorValue} (${source})`;
  });

  return colorLines.join('\n');
}

/**
 * Creates a color palette preview
 */
export function createColorPalettePreview(debugInfo: ThemeDebugInfo): string {
  const colors = debugInfo.colorValues;
  
  return `
🎨 **Color Palette Preview:**
${renderColorValue(colors.Background, 'Background')}  ${renderColorValue(colors.Foreground, 'Foreground')}
${renderColorValue(colors.LightBlue, 'LightBlue')}  ${renderColorValue(colors.AccentBlue, 'AccentBlue')}
${renderColorValue(colors.AccentPurple, 'AccentPurple')}  ${renderColorValue(colors.AccentCyan, 'AccentCyan')}
${renderColorValue(colors.AccentGreen, 'AccentGreen')}  ${renderColorValue(colors.AccentYellow, 'AccentYellow')}
${renderColorValue(colors.AccentRed, 'AccentRed')}  ${renderColorValue(colors.Comment, 'Comment')}
${renderColorValue(colors.DiffAdded, 'DiffAdded')}  ${renderColorValue(colors.DiffRemoved, 'DiffRemoved')}
${renderColorValue(colors.Gray, 'Gray')}`;
} 