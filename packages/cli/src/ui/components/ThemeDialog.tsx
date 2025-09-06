/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { getScopeMessageForSetting } from '../../utils/dialogScopeUtils.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { ScopeSelector } from './shared/ScopeSelector.js';

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
  >(settings.merged.ui?.theme || DEFAULT_THEME.name);

  // Generate theme items filtered by selected scope
  const customThemes =
    selectedScope === SettingScope.User
      ? settings.user.settings.ui?.customThemes || {}
      : settings.merged.ui?.customThemes || {};
  const builtInThemes = themeManager
    .getAvailableThemes()
    .filter((theme) => theme.type !== 'custom');
  const customThemeNames = Object.keys(customThemes);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Generate theme items
  const themeItems = [
    ...builtInThemes.map((theme) => ({
      label: theme.name,
      value: theme.name,
      themeNameDisplay: theme.name,
      themeTypeDisplay: capitalize(theme.type),
    })),
    ...customThemeNames.map((name) => ({
      label: name,
      value: name,
      themeNameDisplay: name,
      themeTypeDisplay: 'Custom',
    })),
  ];

  // Find the index of the selected theme, but only if it exists in the list
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === highlightedThemeName,
  );
  // If not found, fall back to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
    },
    [onSelect, selectedScope],
  );

  const handleThemeHighlight = (themeName: string) => {
    setHighlightedThemeName(themeName);
    onHighlight(themeName);
  };

  const handleScopeHighlight = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
  }, []);

  const handleScopeSelect = useCallback(
    (scope: SettingScope) => {
      onSelect(highlightedThemeName, scope);
    },
    [onSelect, highlightedThemeName],
  );

  const [mode, setMode] = useState<'theme' | 'scope'>('theme');

  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        setMode((prev) => (prev === 'theme' ? 'scope' : 'theme'));
      }
      if (key.name === 'escape') {
        onSelect(undefined, selectedScope);
      }
    },
    { isActive: true },
  );

  // Generate scope message for theme setting
  const otherScopeModifiedMessage = getScopeMessageForSetting(
    'ui.theme',
    selectedScope,
    settings,
  );

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
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight = DIALOG_PADDING + selectThemeHeight;

  let includePadding = true;

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

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

  // Subtract margin between code blocks from available height.
  const availableHeightForPanes = Math.max(
    0,
    availableTerminalHeightCodeBlock - 1,
  );

  // The code block is slightly longer than the diff, so give it more space.
  const codeBlockHeight = Math.ceil(availableHeightForPanes * 0.6);
  const diffHeight = Math.floor(availableHeightForPanes * 0.4);
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
      {mode === 'theme' ? (
        <Box flexDirection="row">
          {/* Left Column: Selection */}
          <Box flexDirection="column" width="45%" paddingRight={2}>
            <Text bold={mode === 'theme'} wrap="truncate">
              {mode === 'theme' ? '> ' : '  '}Select Theme{' '}
              <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
            </Text>
            <RadioButtonSelect
              items={themeItems}
              initialIndex={safeInitialThemeIndex}
              onSelect={handleThemeSelect}
              onHighlight={handleThemeHighlight}
              isFocused={mode === 'theme'}
              maxItemsToShow={12}
              showScrollArrows={true}
              showNumbers={mode === 'theme'}
            />
          </Box>

          {/* Right Column: Preview */}
          <Box flexDirection="column" width="55%" paddingLeft={2}>
            <Text bold>Preview</Text>
            {/* Get the Theme object for the highlighted theme, fall back to default if not found */}
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
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,
                    'python',
                    codeBlockHeight,
                    colorizeCodeWidth,
                  )}
                  <Box marginTop={1} />
                  <DiffRenderer
                    diffContent={`--- a/util.py
+++ b/util.py
@@ -1,2 +1,2 @@
- print("Hello, " + name)
+ print(f"Hello, {name}!")
`}
                    availableTerminalHeight={diffHeight}
                    terminalWidth={colorizeCodeWidth}
                    theme={previewTheme}
                  />
                </Box>
              );
            })()}
          </Box>
        </Box>
      ) : (
        <ScopeSelector
          onSelect={handleScopeSelect}
          onHighlight={handleScopeHighlight}
          isFocused={mode === 'scope'}
          initialScope={selectedScope}
        />
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray} wrap="truncate">
          (Use Enter to {mode === 'theme' ? 'select' : 'apply scope'}, Tab to{' '}
          {mode === 'theme' ? 'configure scope' : 'select theme'})
        </Text>
      </Box>
    </Box>
  );
}
