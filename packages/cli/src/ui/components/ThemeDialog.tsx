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
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string) => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string) => void;
}

export function ThemeDialog({
  onSelect,
  onHighlight,
}: ThemeDialogProps): React.JSX.Element {
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
        onHighlight={onHighlight}
      />
      <Box marginTop={1}>
        <Text color={Colors.SubtleComment}>
          (Use ↑/↓ arrows and Enter to select)
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
