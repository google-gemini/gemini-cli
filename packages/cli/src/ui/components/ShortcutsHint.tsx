/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';

/**
 * A concise, ambient hint for shortcuts shown in the multipurpose status row.
 */
export const ShortcutsHint: React.FC = () => {
  const { cleanUiDetailsVisible, shortcutsHelpVisible } = useUIState();

  const text = cleanUiDetailsVisible
    ? '? for shortcuts'
    : 'press tab twice for more';

  const color = shortcutsHelpVisible ? theme.text.accent : theme.text.secondary;

  return (
    <Box flexDirection="row">
      <Text color={color}>{text}</Text>
    </Box>
  );
};
