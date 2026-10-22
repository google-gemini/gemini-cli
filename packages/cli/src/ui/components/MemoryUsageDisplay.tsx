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
  const [memoryUsage, setMemoryUsage] = useState<string>(() =>
    formatBytes(process.memoryUsage().rss),
  );
  const [memoryUsageColor, setMemoryUsageColor] = useState<string>(() =>
    process.memoryUsage().rss >= 2 * 1024 * 1024 * 1024
      ? theme.status.error
      : color,
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const updateMemory = () => {
      const usage = process.memoryUsage().rss;
      const formatted = formatBytes(usage);
      const nextColor =
        usage >= 2 * 1024 * 1024 * 1024 ? theme.status.error : color;
      setMemoryUsage((prev) => (prev === formatted ? prev : formatted));
      setMemoryUsageColor((prev) => (prev === nextColor ? prev : nextColor));
    };

    const intervalId = setInterval(updateMemory, 2000);
    updateMemory(); // Initial update
    return () => clearInterval(intervalId);
  }, [color, isActive]);

  return (
    <Box>
      <Text color={memoryUsageColor}>{memoryUsage}</Text>
    </Box>
  );
};
