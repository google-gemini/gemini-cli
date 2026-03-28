/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceData } from '@google/gemini-cli-core';

interface MemoryChartProps {
  data: PerformanceData['memory'];
}

export const MemoryChart: React.FC<MemoryChartProps> = ({ data }) => {
  const { current, trend } = data;

  const heapUsedMB = (current.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMB = (current.heapTotal / 1024 / 1024).toFixed(1);
  const rssMB = (current.rss / 1024 / 1024).toFixed(1);
  const heapRatio = (current.heapUsed / current.heapTotal) * 100;

  const getBarColor = (ratio: number) => {
    if (ratio > 90) return 'red';
    if (ratio > 75) return 'yellow';
    return 'green';
  };

  const barLength = 40;
  const filledLength = Math.floor((heapRatio / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  const trendIcon =
    trend.direction === 'increasing'
      ? '📈'
      : trend.direction === 'decreasing'
        ? '📉'
        : '📊';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold underline>
          Memory Usage
        </Text>
      </Box>

      <Box flexDirection="column">
        {/* Heap bar */}
        <Box>
          <Text>Heap: </Text>
          <Text color={getBarColor(heapRatio)}>{bar}</Text>
          <Text> {heapRatio.toFixed(1)}%</Text>
        </Box>

        {/* Metric values */}
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text>Used: </Text>
            <Text color="cyan">{heapUsedMB} MB</Text>
            <Text> / Total: </Text>
            <Text color="cyan">{heapTotalMB} MB</Text>
          </Box>
          <Box>
            <Text>RSS: </Text>
            <Text color="cyan">{rssMB} MB</Text>
          </Box>
          <Box>
            <Text>External: </Text>
            <Text color="cyan">
              {(current.external / 1024 / 1024).toFixed(1)} MB
            </Text>
          </Box>
        </Box>

        {/* Trend */}
        <Box marginTop={1}>
          <Text>
            Trend: {trendIcon} {trend.direction}
          </Text>
          <Text> ({trend.ratePerMinute.toFixed(2)} MB/min)</Text>
        </Box>

        {trend.projectedOOMIn && (
          <Box marginTop={1}>
            <Text color="red">
              ⚠️ Possible OOM in ~{trend.projectedOOMIn.toFixed(0)} minutes
            </Text>
          </Box>
        )}

        {/*
          Stats box — flexDirection="column" is required so the label and
          each metric row stack vertically instead of collapsing into a
          single horizontal line.
        */}
        <Box
          marginTop={1}
          borderStyle="single"
          padding={1}
          flexDirection="column"
        >
          <Text bold>Stats (last 5 min):</Text>
          <Box marginTop={1}>
            <Text>Min: </Text>
            <Text color="cyan">
              {(data.stats.min / 1024 / 1024).toFixed(1)} MB
            </Text>
          </Box>
          <Box>
            <Text>Max: </Text>
            <Text color="cyan">
              {(data.stats.max / 1024 / 1024).toFixed(1)} MB
            </Text>
          </Box>
          <Box>
            <Text>Avg: </Text>
            <Text color="cyan">
              {(data.stats.avg / 1024 / 1024).toFixed(1)} MB
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
