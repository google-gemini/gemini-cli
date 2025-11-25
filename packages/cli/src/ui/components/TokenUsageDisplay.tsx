/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useSessionStats } from '../contexts/SessionContext.js';

export const TokenUsageDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { models } = stats.metrics;

  let inputTokens = 0;
  let outputTokens = 0;

  for (const modelMetrics of Object.values(models)) {
    inputTokens += modelMetrics.tokens.prompt;
    outputTokens += modelMetrics.tokens.candidates;
  }

  return (
    <Box>
      <Text color={theme.text.secondary}> | </Text>
      <Text color={theme.text.accent}>↑</Text>
      <Text color={theme.text.secondary}>{inputTokens.toLocaleString()} </Text>
      <Text color={theme.text.accent}>↓</Text>
      <Text color={theme.text.secondary}>{outputTokens.toLocaleString()}</Text>
    </Box>
  );
};
