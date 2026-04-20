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

export const MemoryUsageDisplay: React.FC<{
  color?: string;
  isActive?: boolean;
}> = ({ color = theme.text.primary, isActive = true }) => {
  const [rssUsage, setRssUsage] = useState<string>('');
  const [heapUsage, setHeapUsage] = useState<string>('');
  const [memoryUsageColor, setMemoryUsageColor] = useState<string>(color);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const updateMemory = () => {
      const usage = process.memoryUsage();
      const rss = usage.rss;
      setRssUsage(formatBytes(rss));
      setHeapUsage(formatBytes(usage.heapUsed));
      setMemoryUsageColor(
        rss >= 2 * 1024 * 1024 * 1024 ? theme.status.error : color,
      );
    };

    const intervalId = setInterval(updateMemory, 2000);
    updateMemory(); // Initial update
    return () => clearInterval(intervalId);
  }, [color, isActive]);

  return (
    <Box>
      <Text color={memoryUsageColor}>
        {rssUsage} (Heap: {heapUsage})
      </Text>
    </Box>
  );
};
