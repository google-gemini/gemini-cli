/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string | undefined, scope: SettingScope) => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string | undefined) => void;
  /** The settings object */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export function ThemeDialog({
  onSelect,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );

  // Track the currently highlighted theme name
  const [highlightedThemeName, setHighlightedThemeName] = useState<
    string | undefined
  >(settings.merged.theme || DEFAULT_THEME.name);

  // Generate theme items filtered by selected scope
  const customThemes =
    selectedScope === SettingScope.User
      ? settings.user.settings.customThemes || {}
      : settings.merged.customThemes || {};
  const builtInThemes = themeManager
    .getAvailableThemes()
    .filter((theme) => theme.type !== 'custom');
  const customThemeNames = Object.keys(customThemes);
  const themeItems = [
    ...builtInThemes.map((theme) => ({
      label: theme.name,
      value: theme.name,
      themeNameDisplay: theme.name,
      themeTypeDisplay:
        theme.type.charAt(0).toUpperCase() + theme.type.slice(1),
    })),
    ...customThemeNames.map((name) => ({
      label: name,
      value: name,
      themeNameDisplay: name,
      themeTypeDisplay: 'Custom',
    })),
  ];
  const [selectInputKey, setSelectInputKey] = useState(Date.now());

  // Find the index of the selected theme, but only if it exists in the list
  const selectedThemeName = settings.merged.theme || DEFAULT_THEME.name;
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === selectedThemeName
  );
  // If not found, fallback to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const scopeItems = [
    { label: 'User Settings', value: SettingScope.User },
    { label: 'Workspace Settings', value: SettingScope.Workspace },
  ];

  const handleThemeSelect = (themeName: string) => {
    onSelect(themeName, selectedScope);
  };

  // Update highlighted theme name and call onHighlight
  const handleThemeHighlight = (themeName: string) => {
    setHighlightedThemeName(themeName);
    onHighlight(themeName);
  };

  const handleScopeHighlight = (scope: SettingScope) => {
    setSelectedScope(scope);
    setSelectInputKey(Date.now());
  };

  const handleScopeSelect = (scope: SettingScope) => {
    handleScopeHighlight(scope);
    setFocusedSection('theme'); // Reset focus to theme section
  };

  const [focusedSection, setFocusedSection] = useState<'theme' | 'scope'>(
    'theme',
  );

  useInput((input, key) => {
    if (key.tab) {
      setFocusedSection((prev) => (prev === 'theme' ? 'scope' : 'theme'));
    }
    if (key.escape) {
      onSelect(undefined, selectedScope);
    }
  });

  let otherScopeModifiedMessage = '';
  const otherScope =
    selectedScope === SettingScope.User
      ? SettingScope.Workspace
      : SettingScope.User;
  if (settings.forScope(otherScope).settings.theme !== undefined) {
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.theme !== undefined
        ? `(Also modified in ${otherScope})`
        : `(Modified in ${otherScope})`;
  }

  // Constants for calculating preview pane layout.
  // These values are based on the JSX structure below.
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  // A safety margin to prevent text from touching the border.
  // This is a complete hack unrelated to the 0.9 used in App.tsx
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // Combined horizontal padding from the dialog and preview pane.
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
      PREVIEW_PANE_WIDTH_PERCENTAGE *
      PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  const DAILOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const SCOPE_SELECTION_HEIGHT = 4; // Height for the scope selection section + margin.
  const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight =
    DAILOG_PADDING +
    selectThemeHeight +
    SCOPE_SELECTION_HEIGHT +
    SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

  let showScopeSelection = true;
  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DAILOG_PADDING;
  }

  if (totalLeftHandSideHeight > availableTerminalHeight) {
    // First, try hiding the scope selection
    totalLeftHandSideHeight -= SCOPE_SELECTION_HEIGHT;
    showScopeSelection = false;
  }

  // Don't focus the scope selection if it is hidden due to height constraints.
  const currenFocusedSection = !showScopeSelection ? 'theme' : focusedSection;

  // Vertical space taken by elements other than the two code blocks in the preview pane.
  // Includes "Preview" title, borders, and margin between blocks.
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // The right column doesn't need to ever be shorter than the left column.
  availableTerminalHeight = Math.max(
    availableTerminalHeight,
    totalLeftHandSideHeight,
  );
  const availableTerminalHeightCodeBlock =
    availableTerminalHeight -
    PREVIEW_PANE_FIXED_VERTICAL_SPACE -
    (includePadding ? 2 : 0) * 2;
  // Give slightly more space to the code block as it is 3 lines longer.
  const diffHeight = Math.floor(availableTerminalHeightCodeBlock / 2) - 1;
  const codeBlockHeight = Math.ceil(availableTerminalHeightCodeBlock / 2) + 1;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Box flexDirection="row">
        {/* Left Column: Selection */}
        <Box flexDirection="column" width="45%" paddingRight={2}>
          <Text bold={currenFocusedSection === 'theme'} wrap="truncate">
            {currenFocusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
            <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
          </Text>
          <RadioButtonSelect
            key={selectInputKey}
            items={themeItems}
            initialIndex={safeInitialThemeIndex}
            onSelect={handleThemeSelect}
            onHighlight={handleThemeHighlight}
            isFocused={currenFocusedSection === 'theme'}
          />

          {/* Scope Selection */}
          {showScopeSelection && (
            <Box marginTop={1} flexDirection="column">
              <Text bold={currenFocusedSection === 'scope'} wrap="truncate">
                {currenFocusedSection === 'scope' ? '> ' : '  '}Apply To
              </Text>
              <RadioButtonSelect
                items={scopeItems}
                initialIndex={0} // Default to User Settings
                onSelect={handleScopeSelect}
                onHighlight={handleScopeHighlight}
                isFocused={currenFocusedSection === 'scope'}
              />
            </Box>
          )}
        </Box>

        {/* Right Column: Preview */}
        <Box flexDirection="column" width="55%" paddingLeft={2}>
          <Text bold>Preview</Text>
          {/* Get the Theme object for the highlighted theme, fallback to default if not found */}
          {(() => {
            const previewTheme =
              themeManager.getTheme(
                highlightedThemeName || DEFAULT_THEME.name,
              ) || DEFAULT_THEME;
            return (
              <Box
                borderStyle="single"
                borderColor={Colors.Gray}
                paddingTop={includePadding ? 1 : 0}
                paddingBottom={includePadding ? 1 : 0}
                paddingLeft={1}
                paddingRight={1}
                flexDirection="column"
              >
                {colorizeCode(
                  `# function
-def fibonacci(n):
-    a, b = 0, 1
-    for _ in range(n):
-        a, b = b, a + b
-    return a`,
                  'python',
                  codeBlockHeight,
                  colorizeCodeWidth,
                )}
                <Box marginTop={1} />
                <DiffRenderer
                  diffContent={`--- a/old_file.txt\n+++ b/new_file.txt\n@@ -1,6 +1,7 @@\n # function\n-def fibonacci(n):\n-    a, b = 0, 1\n-    for _ in range(n):\n-        a, b = b, a + b\n-    return a\n+def fibonacci(n):\n+    a, b = 0, 1\n+    for _ in range(n):\n+        a, b = b, a + b\n+    return a\n+\n+print(fibonacci(10))\n`}
                  availableTerminalHeight={diffHeight}
                  terminalWidth={colorizeCodeWidth}
                  theme={previewTheme}
                />
              </Box>
            );
          })()}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray} wrap="truncate">
          (Use Enter to select
          {showScopeSelection ? ', Tab to change focus' : ''})
        </Text>
      </Box>
    </Box>
  );
}
