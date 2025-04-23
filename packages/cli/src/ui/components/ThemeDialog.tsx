/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { themeManager } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string) => void;
}

export function ThemeDialog({ onSelect }: ThemeDialogProps): React.JSX.Element {
  const themeItems = themeManager.getAvailableThemes().map((theme) => ({
    label: theme.active ? `${theme.name} (Active)` : theme.name,
    value: theme.name,
  }));
  const initialIndex = themeItems.findIndex(
    (item) => item.value === themeManager.getActiveTheme().name,
  );
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      flexDirection="column"
      padding={1}
      width="50%"
    >
      <Box marginBottom={1}>
        <Text bold>Select Theme</Text>
      </Box>
      <RadioButtonSelect
        items={themeItems}
        initialIndex={initialIndex}
        onSelect={onSelect}
      />
      <Box marginTop={1}>
        <Text color={Colors.SubtleComment}>
          (Use ↑/↓ arrows and Enter to select)
        </Text>
      </Box>
    </Box>
  );
}
