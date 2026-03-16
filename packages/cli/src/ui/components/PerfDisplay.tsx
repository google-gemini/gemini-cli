/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import type { StartupPhaseStats } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { formatBytes, formatDuration } from '../utils/formatters.js';
import type { PerfMemoryStats, PerfRuntimeStats } from '../types.js';
import {
  CACHE_EFFICIENCY_HIGH,
  CACHE_EFFICIENCY_MEDIUM,
  getStatusColor,
} from '../utils/displayUtils.js';

const LABEL_WIDTH = 22;

interface StatRowProps {
  label: string;
  children: React.ReactNode;
}

const StatRow: React.FC<StatRowProps> = ({ label, children }) => (
  <Box>
    <Box width={LABEL_WIDTH}>
      <Text color={theme.text.link}>{label}</Text>
    </Box>
    {children}
  </Box>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

const formatPhaseDuration = (durationMs: number): string =>
  durationMs < 1000
    ? `${durationMs.toFixed(1)} ms`
    : formatDuration(durationMs);

export const PerfDisplay: React.FC<{
  memory: PerfMemoryStats;
  runtime: PerfRuntimeStats;
  startupPhases: StartupPhaseStats[];
}> = ({ memory, runtime, startupPhases }) => {
  const sortedStartupPhases = [...startupPhases].sort(
    (a, b) => a.start_time_usec - b.start_time_usec,
  );
  const heapUsage = `${formatBytes(memory.heapUsed)} / ${formatBytes(
    memory.heapTotal,
  )} (${memory.heapUsedPercent.toFixed(1)}%)`;
  const apiTime = `${formatDuration(runtime.apiTimeMs)} (${runtime.apiTimePercent.toFixed(1)}%)`;
  const toolTime = `${formatDuration(runtime.toolTimeMs)} (${runtime.toolTimePercent.toFixed(1)}%)`;
  const cacheEfficiencyColor = getStatusColor(runtime.cacheEfficiency, {
    green: CACHE_EFFICIENCY_HIGH,
    yellow: CACHE_EFFICIENCY_MEDIUM,
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

      <Section title="Memory Usage">
        <StatRow label="RSS">
          <Text color={theme.text.primary}>{formatBytes(memory.rss)}</Text>
        </StatRow>
        <StatRow label="Heap Used">
          <Text color={theme.text.primary}>{heapUsage}</Text>
        </StatRow>
        <StatRow label="External">
          <Text color={theme.text.primary}>{formatBytes(memory.external)}</Text>
        </StatRow>
      </Section>

      <Section title="Startup Phases">
        {sortedStartupPhases.length === 0 ? (
          <Text color={theme.text.secondary}>
            No startup phase timings are available for this session.
          </Text>
        ) : (
          sortedStartupPhases.map((phase) => (
            <StatRow key={phase.name} label={phase.name}>
              <Text color={theme.text.primary}>
                {formatPhaseDuration(phase.duration_ms)}
              </Text>
            </StatRow>
          ))
        )}
      </Section>

      <Section title="Runtime Performance">
        <StatRow label="API Time">
          <Text color={theme.text.primary}>{apiTime}</Text>
        </StatRow>
        <StatRow label="Tool Time">
          <Text color={theme.text.primary}>{toolTime}</Text>
        </StatRow>
        <StatRow label="Cache Efficiency">
          <Text color={cacheEfficiencyColor}>
            {runtime.cacheEfficiency.toFixed(1)}%
          </Text>
        </StatRow>
      </Section>
    </Box>
  );
};
