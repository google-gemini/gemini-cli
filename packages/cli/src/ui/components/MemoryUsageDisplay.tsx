/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import process from 'node:process';
import { formatMemoryUsage } from '../utils/formatters.js';

export const MemoryUsageDisplay: React.FC = () => {
  const [memoryUsage, setMemoryUsage] = useState<string>('');
  const [memoryUsageColor, setMemoryUsageColor] = useState<string>(
    semanticTheme.text.secondary,
  );

  useEffect(() => {
    const updateMemory = () => {
      const usage = process.memoryUsage().rss;
      setMemoryUsage(formatMemoryUsage(usage));
      setMemoryUsageColor(
        usage >= 2 * 1024 * 1024 * 1024
          ? semanticTheme.status.error
          : semanticTheme.text.secondary,
      );
    };
    const intervalId = setInterval(updateMemory, 2000);
    updateMemory(); // Initial update
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Box>
      <Text color={semanticTheme.text.secondary}> | </Text>
      <Text color={memoryUsageColor}>{memoryUsage}</Text>
    </Box>
  );
};
