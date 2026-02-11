/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { type Config } from '@google/gemini-cli-core';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = () => (
  <Box flexDirection="column" marginTop={1}>
    <Text color={theme.text.primary}>Tips for getting started:</Text>
    <Text color={theme.text.primary}>
      1. <Text color={theme.text.secondary}>/help</Text> for more information
    </Text>
    <Text color={theme.text.primary}>
      2. Ask coding questions, edit code or run commands
    </Text>
    <Text color={theme.text.primary}>3. Be specific for the best results</Text>
  </Box>
);
