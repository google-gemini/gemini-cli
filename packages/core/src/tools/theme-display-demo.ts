/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createColorMappingDisplay, createColorPalettePreview } from './theme-display.js';
import type { ThemeDebugInfo } from './theme-types.js';

// Demo function to show the new color display format
export function demonstrateColorDisplay() {
  const debugInfo: ThemeDebugInfo = {
    themeName: 'Nord Theme',
    colorSources: {
      Background: 'Theme color: editor.background',
      Foreground: 'Theme color: editor.foreground',
      LightBlue: 'Theme color: button.background',
      AccentBlue: 'Theme token: keyword',
      AccentPurple: 'Theme token: storage.type',
      AccentCyan: 'Theme token: entity.name.class',
      AccentGreen: 'Theme token: constant.numeric',
      AccentYellow: 'Theme token: string',
      AccentRed: 'Theme token: comment',
      DiffAdded: 'Generated diff added',
      DiffRemoved: 'Generated diff removed',
      Comment: 'Theme token: comment',
      Gray: 'Theme color: editor.background',
    },
    colorValues: {
      Background: '#2e3440',
      Foreground: '#d8dee9',
      LightBlue: '#5e81ac',
      AccentBlue: '#81a1c1',
      AccentPurple: '#81a1c1',
      AccentCyan: '#8fbcbb',
      AccentGreen: '#a3be8c',
      AccentYellow: '#a3be8c',
      AccentRed: '#616e87',
      DiffAdded: '#a3be8c',
      DiffRemoved: '#bf616a',
      Comment: '#616e87',
      Gray: '#2e3440',
    }
  };

  console.log('=== Color Mapping Details ===');
  console.log(createColorMappingDisplay(debugInfo));
  
  console.log('\n=== Color Palette Preview ===');
  console.log(createColorPalettePreview(debugInfo));
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateColorDisplay();
} 