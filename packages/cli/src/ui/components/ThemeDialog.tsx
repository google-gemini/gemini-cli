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
}

export function ThemeDialog({
  onSelect,
  onHighlight,
  settings,
}: ThemeDialogProps): React.JSX.Element {
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );

  const themeItems = themeManager.getAvailableThemes().map((theme) => ({
    label: theme.active ? `${theme.name} (Active)` : theme.name,
    value: theme.name,
  }));
  const [selectInputKey, setSelectInputKey] = useState(Date.now());

  const initialThemeIndex = themeItems.findIndex(
    (item) =>
      item.value ===
      (settings.forScope(selectedScope).settings.theme || DEFAULT_THEME.name),
  );

  const scopeItems = [
    { label: 'User Settings', value: SettingScope.User },
    { label: 'Workspace Settings', value: SettingScope.Workspace },
  ];

  const handleThemeSelect = (themeName: string) => {
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
      borderColor={Colors.AccentCyan}
      flexDirection="column"
      padding={1}
      width="50%"
    >
      <Text bold={focusedSection === 'theme'}>
        {focusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
        <Text color={Colors.SubtleComment}>{otherScopeModifiedMessage}</Text>
      </Text>

      <RadioButtonSelect
        key={selectInputKey}
        items={themeItems}
        initialIndex={initialThemeIndex}
        onSelect={handleThemeSelect} // Use the wrapper handler
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

      <Box marginTop={1} flexDirection="column">
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
