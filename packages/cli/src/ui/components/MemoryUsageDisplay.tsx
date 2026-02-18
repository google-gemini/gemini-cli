/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { theme } from '../semantic-colors.js';
import process from 'node:process';
import { formatBytes } from '../utils/formatters.js';

export const MemoryUsageDisplay: React.FC<{ color?: string }> = ({
  color = theme.text.primary,
}) => {
  const [memoryUsage, setMemoryUsage] = useState<string>('');
  const [memoryUsageColor, setMemoryUsageColor] = useState<string>(color);

  useEffect(() => {
    const updateMemory = () => {
      const usage = process.memoryUsage().rss;
      setMemoryUsage(formatBytes(usage));
      setMemoryUsageColor(
        usage >= 2 * 1024 * 1024 * 1024 ? theme.status.error : color,
      );
    };
    const intervalId = setInterval(updateMemory, 2000);
    updateMemory(); // Initial update
    return () => clearInterval(intervalId);
  }, [color]);

  return (
    <Box>
      <Text color={memoryUsageColor}>{memoryUsage}</Text>
    </Box>
  );
};
