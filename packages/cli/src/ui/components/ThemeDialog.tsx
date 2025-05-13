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
  /** Callback to set the query */
  setQuery: (query: string) => void;
}

export function ThemeDialog({
  onSelect,
  onHighlight,
  settings,
  setQuery,
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
  ];

  const handleThemeSelect = (themeName: string) => {
    setQuery(''); // Clear the query when user selects a theme
    onSelect(themeName, selectedScope);
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
      setQuery(''); // Clear the query when user hits escape
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

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentPurple}
      flexDirection="row"
      padding={1}
      width="100%"
    >
      {/* Left Column: Selection */}
      <Box flexDirection="column" width="50%" paddingRight={2}>
        <Text bold={focusedSection === 'theme'}>
          {focusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
          <Text color={Colors.SubtleComment}>{otherScopeModifiedMessage}</Text>
        </Text>
        <RadioButtonSelect
          key={selectInputKey}
          items={themeItems}
          initialIndex={initialThemeIndex}
          onSelect={handleThemeSelect}
          onHighlight={onHighlight}
          isFocused={focusedSection === 'theme'}
        />

        {/* Scope Selection */}
        <Box marginTop={1} flexDirection="column">
          <Text bold={focusedSection === 'scope'}>
            {focusedSection === 'scope' ? '> ' : '  '}Apply To
          </Text>
          <RadioButtonSelect
            items={scopeItems}
            initialIndex={0} // Default to User Settings
            onSelect={handleScopeSelect}
            onHighlight={handleScopeHighlight}
            isFocused={focusedSection === 'scope'}
          />
        </Box>

        <Box marginTop={1}>
          <Text color={Colors.SubtleComment}>
            (Use ↑/↓ arrows and Enter to select, Tab to change focus)
          </Text>
        </Box>
      </Box>

      {/* Right Column: Preview */}
      <Box flexDirection="column" width="50%" paddingLeft={3}>
        <Text bold>Preview</Text>
        <Box
          borderStyle="single"
          borderColor={Colors.SubtleComment}
          padding={1}
          flexDirection="column"
        >
          {colorizeCode(
            `# Source code
print("Hello, World!")
`,
            'python',
          )}
          <Box marginTop={1} />
          <DiffRenderer
            diffContent={`--- a/old_file.txt
+++ b/new_file.txt
@@ -1,4 +1,5 @@
 This is a context line.
-This line was deleted.
+This line was added.
`}
          />
        </Box>
      </Box>
    </Box>
  );
}
