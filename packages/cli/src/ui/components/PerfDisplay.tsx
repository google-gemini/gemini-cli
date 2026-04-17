/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import { getStatusColor } from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import type { StartupPhaseStats } from '@google/gemini-cli-core';

const HEAP_WARNING_THRESHOLD = 75; // % of heapTotal — yellow
const HEAP_CRITICAL_THRESHOLD = 90; // % of heapTotal — red

interface PerfDisplayProps {
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  startupPhases: StartupPhaseStats[] | null;
}

export const PerfDisplay: React.FC<PerfDisplayProps> = ({
  memoryUsage,
  startupPhases,
}) => {
  const { stats } = useSessionStats();
  const computed = computeSessionStats(stats.metrics);

  const toMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const heapPercent =
    memoryUsage.heapTotal > 0
      ? (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      : 0;
  const heapColor = getStatusColor(heapPercent, {
    green: HEAP_WARNING_THRESHOLD,
    yellow: HEAP_CRITICAL_THRESHOLD,
  });

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
    >
      <Text bold color={theme.text.accent}>
        Performance Stats
      </Text>
      <Box height={1} />

      {/* Memory section */}
      <Text bold color={theme.text.primary}>
        Memory Usage
      </Text>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>RSS:</Text>
        </Box>
        <Text color={theme.text.primary}>{toMB(memoryUsage.rss)} MB</Text>
      </Box>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>Heap Used:</Text>
        </Box>
        <Text color={heapColor}>
          {toMB(memoryUsage.heapUsed)} / {toMB(memoryUsage.heapTotal)} MB (
          {heapPercent.toFixed(1)}%)
        </Text>
      </Box>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>External:</Text>
        </Box>
        <Text color={theme.text.primary}>{toMB(memoryUsage.external)} MB</Text>
      </Box>
      <Box height={1} />

      {/* Startup phases section */}
      <Text bold color={theme.text.primary}>
        Startup Phases
      </Text>
      {startupPhases === null ? (
        <Text color={theme.text.secondary}>
          No startup timing data was recorded for this session.
        </Text>
      ) : (
        startupPhases.map((phase) => (
          <Box key={phase.name}>
            <Box width={32}>
              <Text color={theme.text.link}>{phase.name}:</Text>
            </Box>
            <Text color={theme.text.primary}>
              {phase.duration_ms.toFixed(1)} ms
            </Text>
          </Box>
        ))
      )}
      <Box height={1} />

      {/* Runtime performance section */}
      <Text bold color={theme.text.primary}>
        Runtime Performance
      </Text>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>API Time:</Text>
        </Box>
        <Text color={theme.text.primary}>
          {formatDuration(computed.totalApiTime)}{' '}
          <Text color={theme.text.secondary}>
            ({computed.apiTimePercent.toFixed(1)}%)
          </Text>
        </Text>
      </Box>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>Tool Time:</Text>
        </Box>
        <Text color={theme.text.primary}>
          {formatDuration(computed.totalToolTime)}{' '}
          <Text color={theme.text.secondary}>
            ({computed.toolTimePercent.toFixed(1)}%)
          </Text>
        </Text>
      </Box>
      <Box>
        <Box width={28}>
          <Text color={theme.text.link}>Cache Efficiency:</Text>
        </Box>
        <Text color={theme.text.primary}>
          {computed.cacheEfficiency.toFixed(1)}%
        </Text>
      </Box>
    </Box>
  );
};
