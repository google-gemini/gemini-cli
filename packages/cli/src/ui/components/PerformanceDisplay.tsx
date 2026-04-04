/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatBytes, formatDuration } from '../utils/formatters.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  startupProfiler,
  type StartupPhaseStats,
} from '@google/gemini-cli-core';

const PHASE_NAME_COL_WIDTH = 25;
const DURATION_COL_WIDTH = 15;

const HEAP_THRESHOLD_WARNING = 75;
const HEAP_THRESHOLD_CRITICAL = 90;

const getHeapColor = (percent: number): string => {
  if (percent >= HEAP_THRESHOLD_CRITICAL) {
    return theme.status.error;
  }
  if (percent >= HEAP_THRESHOLD_WARNING) {
    return theme.status.warning;
  }
  return theme.status.success;
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

const StatRow: React.FC<{
  label: string;
  value: string;
  valueColor?: string;
}> = ({ label, value, valueColor }) => (
  <Box>
    <Box width={20}>
      <Text color={theme.text.secondary}> {label}</Text>
    </Box>
    <Text color={valueColor ?? theme.text.primary}>{value}</Text>
  </Box>
);

const PhaseRow: React.FC<{
  phase: StartupPhaseStats;
}> = ({ phase }) => (
  <Box>
    <Box width={PHASE_NAME_COL_WIDTH}>
      <Text color={theme.text.link}> {phase.name}</Text>
    </Box>
    <Box width={DURATION_COL_WIDTH} justifyContent="flex-end">
      <Text color={theme.text.primary}>{phase.duration_ms.toFixed(1)} ms</Text>
    </Box>
  </Box>
);

export const PerformanceDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const computed = computeSessionStats(stats.metrics);

  const mem = process.memoryUsage();
  const heapPercent =
    mem.heapTotal > 0 ? (mem.heapUsed / mem.heapTotal) * 100 : 0;
  const heapColor = getHeapColor(heapPercent);

  const startupPhases = startupProfiler.getLastFlushResults();

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      width={70}
    >
      <Text bold color={theme.text.accent}>
        Performance Stats
      </Text>
      <Box height={1} />

      <Section title="Memory Usage">
        <StatRow label="RSS:" value={formatBytes(mem.rss)} />
        <StatRow
          label="Heap Used:"
          value={`${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)} (${heapPercent.toFixed(1)}%)`}
          valueColor={heapColor}
        />
        <StatRow label="External:" value={formatBytes(mem.external)} />
        <StatRow label="Array Buffers:" value={formatBytes(mem.arrayBuffers)} />
      </Section>

      <Section title="Startup Phases">
        {startupPhases.length === 0 ? (
          <Text color={theme.text.secondary}>
            {'  '}No startup phase data available.
          </Text>
        ) : (
          <>
            <Box>
              <Box width={PHASE_NAME_COL_WIDTH}>
                <Text bold color={theme.text.primary}>
                  {'  '}Phase
                </Text>
              </Box>
              <Box width={DURATION_COL_WIDTH} justifyContent="flex-end">
                <Text bold color={theme.text.primary}>
                  Duration
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
            {startupPhases.map((phase) => (
              <PhaseRow key={phase.name} phase={phase} />
            ))}
          </>
        )}
      </Section>

      <Section title="Runtime Performance">
        <StatRow
          label="API Time:"
          value={
            computed.agentActiveTime > 0
              ? `${formatDuration(computed.totalApiTime)} (${computed.apiTimePercent.toFixed(1)}%)`
              : '--'
          }
        />
        <StatRow
          label="Tool Time:"
          value={
            computed.agentActiveTime > 0
              ? `${formatDuration(computed.totalToolTime)} (${computed.toolTimePercent.toFixed(1)}%)`
              : '--'
          }
        />
        <StatRow
          label="Cache Efficiency:"
          value={
            computed.totalPromptTokens > 0
              ? `${computed.cacheEfficiency.toFixed(1)}%`
              : '--'
          }
        />
      </Section>
    </Box>
  );
};
