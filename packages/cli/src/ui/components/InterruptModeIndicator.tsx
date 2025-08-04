/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export const InterruptModeIndicator: React.FC = () => (
  <Box>
    <Text color={Colors.AccentYellow}>
      interrupt mode enabled
      <Text color={Colors.Gray}> (ctrl+n to disable)</Text>
    </Text>
  </Box>
);
