/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { getContextUsagePercentage } from '../utils/contextUsage.js';
import { useKeypress } from '../hooks/useKeypress.js';

export const TokenBudgetWarning: React.FC = () => {
  const uiState = useUIState();
  const [hasDismissed, setHasDismissed] = useState(false);

  // Consider the token percentage.
  const percentage = getContextUsagePercentage(
    uiState.sessionStats.lastPromptTokenCount,
    typeof uiState.currentModel === 'string' ? uiState.currentModel : undefined,
  );

  const threshold = 0.8;
  const isOverThreshold = percentage > threshold;

  useEffect(() => {
    if (!isOverThreshold) {
      setHasDismissed(false);
    }
  }, [isOverThreshold]);

  useKeypress(
    (_ch, key) => {
      if (key.name === 'escape') {
        setHasDismissed(true);
      }
    },
    { isActive: isOverThreshold && !hasDismissed },
  );

  if (!isOverThreshold || hasDismissed || uiState.dialogsVisible) {
    return null;
  }

  const percentageUsed = (percentage * 100).toFixed(0);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={theme.status.warning} bold>
        ?? Context window nearing capacity ({percentageUsed}% used)
      </Text>
      <Text>Your conversation is approaching the model's token limit.</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.text.secondary}>Consider:</Text>
        <Text color={theme.text.secondary}>• Starting a new session</Text>
        <Text color={theme.text.secondary}>• Clearing context</Text>
        <Text color={theme.text.secondary}>• Summarizing previous messages</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.dim}>Press ESC to dismiss this warning</Text>
      </Box>
    </Box>
  );
};
