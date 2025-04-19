/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';

interface FooterProps {
  queryLength: number;
}

export const Footer: React.FC<FooterProps> = ({ queryLength }) => (
  <Box marginTop={1} justifyContent="space-between">
    <Box minWidth={15}>
      <Text color={Colors.SubtleComment}>
        {queryLength === 0 ? '? for shortcuts' : ''}
      </Text>
    </Box>
    <Text color={Colors.AccentBlue}>Gemini</Text>
  </Box>
);
