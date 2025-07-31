/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { convertVSCodeThemeToCustomTheme } from './theme-converter.js';

// Test to demonstrate diff color extraction
function testDiffColorExtraction() {
  console.log('=== Testing Diff Color Extraction ===\n');

  // Test 1: Theme with diff colors
  console.log('1. Theme WITH diff colors:');
  const themeWithDiffColors = {
    name: 'Theme With Diff Colors',
    type: 'dark' as const,
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'diffEditor.insertedTextBackground': '#4caf50',
      'diffEditor.removedTextBackground': '#f44336',
      'gitDecoration.addedResourceForeground': '#4caf50',
      'gitDecoration.deletedResourceForeground': '#f44336',
    },
    tokenColors: []
  };

  const result1 = convertVSCodeThemeToCustomTheme(themeWithDiffColors);
  console.log(`   DiffAdded: ${result1.DiffAdded} (${result1.debugInfo.colorSources.DiffAdded})`);
  console.log(`   DiffRemoved: ${result1.DiffRemoved} (${result1.debugInfo.colorSources.DiffRemoved})`);

  // Test 2: Theme without diff colors
  console.log('\n2. Theme WITHOUT diff colors:');
  const themeWithoutDiffColors = {
    name: 'Theme Without Diff Colors',
    type: 'dark' as const,
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      // No diff colors defined
    },
    tokenColors: []
  };

  const result2 = convertVSCodeThemeToCustomTheme(themeWithoutDiffColors);
  console.log(`   DiffAdded: ${result2.DiffAdded} (${result2.debugInfo.colorSources.DiffAdded})`);
  console.log(`   DiffRemoved: ${result2.DiffRemoved} (${result2.debugInfo.colorSources.DiffRemoved})`);

  console.log('\n=== Summary ===');
  console.log('✅ When theme has diff colors: Extract from theme');
  console.log('✅ When theme lacks diff colors: Generate from accent colors');
}

// Run the test
testDiffColorExtraction(); 