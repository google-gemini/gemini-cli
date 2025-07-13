/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
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

  // Generate theme items
  const themeItems = themeManager.getAvailableThemes().map((theme) => {
    const typeString = theme.type.charAt(0).toUpperCase() + theme.type.slice(1);
    return {
      label: theme.name,
      value: theme.name,
      themeNameDisplay: theme.name,
      themeTypeDisplay: typeString,
    };
  });
  const [selectInputKey, setSelectInputKey] = useState(Date.now());

  // Determine which radio button should be initially selected in the theme list
  // This should reflect the theme *saved* for the selected scope, or the default
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === (settings.merged.theme || DEFAULT_THEME.name),
  );

  const scopeItems = [
    { label: 'User Settings', value: SettingScope.User },
    { label: 'Workspace Settings', value: SettingScope.Workspace },
    { label: 'System Settings', value: SettingScope.System },
  ];

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
    },
    [onSelect, selectedScope],
  );

  const handleScopeHighlight = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
    setSelectInputKey(Date.now());
  }, []);

  const handleScopeSelect = useCallback(
    (scope: SettingScope) => {
      handleScopeHighlight(scope);
      setFocusedSection('theme'); // Reset focus to theme section
    },
    [handleScopeHighlight],
  );

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

  const otherScopes = Object.values(SettingScope).filter(
    (scope) => scope !== selectedScope,
  );

  const modifiedInOtherScopes = otherScopes.filter(
    (scope) => settings.forScope(scope).settings.theme !== undefined,
  );

  let otherScopeModifiedMessage = '';
  if (modifiedInOtherScopes.length > 0) {
    const modifiedScopesStr = modifiedInOtherScopes.join(', ');
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.theme !== undefined
        ? `(Also modified in ${modifiedScopesStr})`
        : `(Modified in ${modifiedScopesStr})`;
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

  const DIALOG_PADDING = 2;
  const selectThemeHeight = themeItems.length + 1;
  const SCOPE_SELECTION_HEIGHT = 4; // Height for the scope selection section + margin.
  const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight =
    DIALOG_PADDING +
    selectThemeHeight +
    SCOPE_SELECTION_HEIGHT +
    SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

  let showScopeSelection = true;
  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
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
            initialIndex={initialThemeIndex}
            onSelect={handleThemeSelect}
            onHighlight={onHighlight}
            isFocused={currenFocusedSection === 'theme'}
            maxItemsToShow={8}
            showScrollArrows={true}
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
              diffContent={`--- a/old_file.txt
-+++ b/new_file.txt
-@@ -1,4 +1,5 @@
- This is a context line.
--This line was deleted.
-+This line was added.
-`}
              availableTerminalHeight={diffHeight}
              terminalWidth={colorizeCodeWidth}
            />
          </Box>
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
