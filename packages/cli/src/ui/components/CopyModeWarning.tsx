/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useInputState } from '../contexts/InputContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { theme } from '../semantic-colors.js';

export const CopyModeWarning: React.FC = () => {
  const { copyModeEnabled } = useInputState();
  const { mouseMode } = useUIState();
  const config = useConfig();
  const isTrueAlternateBuffer = config.getUseAlternateBuffer();

  const isSelectionMode = isTrueAlternateBuffer && !mouseMode;
  const showWarning = copyModeEnabled || isSelectionMode;

  return (
    <Box height={1}>
      {showWarning && (
        <Text color={theme.status.warning}>
          In Copy Mode. Use Page Up/Down to scroll. Press Ctrl+S or any other
          key to exit.
        </Text>
      )}
    </Box>
  );
};
