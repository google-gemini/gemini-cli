/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

export const AutoAcceptIndicator: React.FC = () => (
  <Box>
    <Text color={Colors.AccentGreen}>
      accepting edits
      <Text color={Colors.SubtleComment}> (shift + tab to disable)</Text>
    </Text>
  </Box>
);
