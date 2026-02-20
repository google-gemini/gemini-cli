/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { getShortDisplayString } from '@google/gemini-cli-core';
import { useUIState } from '../contexts/UIStateContext.js';

/**
 * Formats token counts for compact display (e.g., 1.2k, 1M).
 */
const formatTokens = (tokens: number): string => {
  if (tokens < 1000) return tokens.toString();
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(tokens);
};

export const TokenUsageIndicator: React.FC = () => {
  const uiState = useUIState();
  const { models } = uiState.sessionStats.metrics;

  const activeModels = Object.entries(models)
    .filter(([, metrics]) => metrics.tokens.total > 0)
    .sort((a, b) => b[1].tokens.total - a[1].tokens.total);

  if (activeModels.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="row" paddingLeft={1}>
      <Text color={theme.ui.comment}>| </Text>
      {activeModels.map(([name, metrics], index) => (
        <Box key={name} flexDirection="row">
          <Text color={theme.text.secondary}>
            {getShortDisplayString(name)}:
          </Text>
          <Text color={theme.text.primary}>
            {formatTokens(metrics.tokens.total)}
          </Text>
          {index < activeModels.length - 1 && (
            <Text color={theme.text.secondary}> </Text>
          )}
        </Box>
      ))}
    </Box>
  );
};
