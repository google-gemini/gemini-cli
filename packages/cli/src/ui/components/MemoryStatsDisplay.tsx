/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatBytes } from '../utils/formatters.js';
import { getMemoryMonitor, type MemorySnapshot } from '@google/gemini-cli-core';

const METRIC_COL_WIDTH = 20;
const VALUE_COL_WIDTH = 15;

const MetricRow: React.FC<{
  label: string;
  value: number;
  format?: 'bytes' | 'number';
  warning?: boolean;
}> = ({ label, value, format = 'bytes', warning = false }) => {
  const displayValue =
    format === 'bytes' ? formatBytes(value) : value.toLocaleString();
  const color = warning ? theme.status.warning : theme.text.primary;

  return (
    <Box>
      <Box width={METRIC_COL_WIDTH}>
        <Text color={theme.text.link}>{label}</Text>
      </Box>
      <Box width={VALUE_COL_WIDTH} justifyContent="flex-end">
        <Text color={color}>{displayValue}</Text>
      </Box>
    </Box>
  );
};

export const MemoryStatsDisplay: React.FC = () => {
  const memoryMonitor = getMemoryMonitor();
  const snapshot: MemorySnapshot = memoryMonitor?.getCurrentMemoryUsage() ?? {
    timestamp: Date.now(),
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    rss: 0,
    arrayBuffers: 0,
    heapSizeLimit: 0,
  };

  const heapUsagePercent =
    snapshot.heapSizeLimit > 0
      ? (snapshot.heapUsed / snapshot.heapSizeLimit) * 100
      : 0;

  const isWarning = heapUsagePercent > 80;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      width={45}
    >
      <Text bold color={theme.text.accent}>
        Memory Stats For Nerds
      </Text>
      <Box height={1} />

      <Box>
        <Box width={METRIC_COL_WIDTH}>
          <Text bold color={theme.text.primary}>
            Metric
          </Text>
        </Box>
        <Box width={VALUE_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            Value
          </Text>
        </Box>
      </Box>

      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      <MetricRow label="RSS" value={snapshot.rss} />
      <MetricRow
        label="Heap Used"
        value={snapshot.heapUsed}
        warning={isWarning}
      />
      <MetricRow label="Heap Total" value={snapshot.heapTotal} />
      <MetricRow label="External" value={snapshot.external} />
      <MetricRow label="Array Buffers" value={snapshot.arrayBuffers} />

      <Box height={1} />

      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
      />

      <MetricRow label="Heap Limit" value={snapshot.heapSizeLimit} />
      <Box>
        <Box width={METRIC_COL_WIDTH}>
          <Text color={theme.text.link}>Heap Usage</Text>
        </Box>
        <Box width={VALUE_COL_WIDTH} justifyContent="flex-end">
          <Text color={isWarning ? theme.status.warning : theme.status.success}>
            {heapUsagePercent.toFixed(1)}%
          </Text>
        </Box>
      </Box>

      {isWarning && (
        <Box marginTop={1}>
          <Text color={theme.status.warning}>
            ⚠ High memory usage detected
          </Text>
        </Box>
      )}
    </Box>
  );
};
