/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { formatCompactNumber } from '../utils/formatCompactNumber.js';
import { calculateTotalCost, formatCost } from '../utils/tokenPricing.js';

export const TokenUsageDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { models } = stats.metrics;

  let inputTokens = 0;
  let outputTokens = 0;

  // Build model tokens map for cost calculation
  const modelTokens: Record<string, { prompt: number; candidates: number }> =
    {};

  for (const [modelName, modelMetrics] of Object.entries(models)) {
    inputTokens += modelMetrics.tokens.prompt;
    outputTokens += modelMetrics.tokens.candidates;
    modelTokens[modelName] = {
      prompt: modelMetrics.tokens.prompt,
      candidates: modelMetrics.tokens.candidates,
    };
  }

  const estimatedCost = calculateTotalCost(modelTokens);

  return (
    <Box>
      <Text color={theme.text.secondary}> | </Text>
      <Text color={theme.text.accent}>↑</Text>
      <Text color={theme.text.secondary}>
        {formatCompactNumber(inputTokens)}{' '}
      </Text>
      <Text color={theme.text.accent}>↓</Text>
      <Text color={theme.text.secondary}>
        {formatCompactNumber(outputTokens)}
      </Text>
      <Text color={theme.text.secondary}> ~{formatCost(estimatedCost)}</Text>
    </Box>
  );
};
