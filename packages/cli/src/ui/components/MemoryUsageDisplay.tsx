/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import process from 'node:process';
import { formatMemoryUsage } from '../utils/formatters.js';
import { useUIState } from '../contexts/UIStateContext.js';

export const MemoryUsageDisplay: React.FC = () => {
  const [memoryUsage, setMemoryUsage] = useState<string>('');
  const [memoryUsageColor, setMemoryUsageColor] = useState<string>(
    theme.text.secondary,
  );

  const uiState = useUIState();

  useEffect(() => {
    const updateMemory = () => {
      const usage = process.memoryUsage().rss;
      setMemoryUsage(formatMemoryUsage(usage));
      setMemoryUsageColor(
        usage >= 2 * 1024 * 1024 * 1024
          ? theme.status.error
          : theme.text.secondary,
      );
    };

    // Update memory when UI is active (input, output, errors changing)
    // This piggybacks on existing UI updates instead of using independent setInterval
    updateMemory();
  }, [
    uiState.streamingState,
    uiState.buffer.text,
    uiState.errorCount,
    uiState.history.length,
  ]);

  return (
    <Box>
      <Text color={theme.text.secondary}> | </Text>
      <Text color={memoryUsageColor}>{memoryUsage}</Text>
    </Box>
  );
};
