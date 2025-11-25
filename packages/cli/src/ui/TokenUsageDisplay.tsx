/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from './semantic-colors.js';

export const TokenUsageDisplay: React.FC = () => {
  // Placeholder values for now
  const inputTokens = 0;
  const outputTokens = 0;

  return (
    <Box>
      <Text color={theme.text.secondary}> | </Text>
      <Text color={theme.text.secondary}>
        ↑{inputTokens.toLocaleString()} ↓{outputTokens.toLocaleString()}
      </Text>
    </Box>
  );
};
