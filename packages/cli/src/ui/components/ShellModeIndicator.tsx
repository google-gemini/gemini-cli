/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

export const ShellModeIndicator: React.FC = () => (
  <Box>
    <Text color={theme.ui.symbol}>
      shell mode enabled
      <Text color={theme.text.secondary}> (esc to disable)</Text>
    </Text>
  </Box>
);
