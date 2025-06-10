/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import { CumulativeStats } from '../contexts/SessionContext.js';

// --- Constants ---

const COLUMN_WIDTH = '48%';

// --- Prop and Data Structures ---

interface StatsDisplayProps {
  stats: CumulativeStats;
  lastTurnStats: CumulativeStats;
  duration: string;
}

interface FormattedStats {
  inputTokens: number;
  outputTokens: number;
  toolUseTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

// --- Helper Components ---

/**
 * Renders a single row with a colored label on the left and a value on the right.
 */
const StatRow: React.FC<{
  label: string;
  value: string | number;
  valueColor?: string;
}> = ({ label, value, valueColor }) => (
  <Box justifyContent="space-between">
    <Text color={Colors.LightBlue}>{label}</Text>
    <Text color={valueColor}>{value}</Text>
  </Box>
);

/**
 * Renders a full column for either "Last Turn" or "Cumulative" stats.
 */
const StatsColumn: React.FC<{
  title: string;
  stats: FormattedStats;
  isCumulative?: boolean;
}> = ({ title, stats, isCumulative = false }) => {
  const cachedDisplay =
    isCumulative && stats.totalTokens > 0
      ? `${stats.cachedTokens.toLocaleString()} (${((stats.cachedTokens / stats.totalTokens) * 100).toFixed(1)}%)`
      : stats.cachedTokens.toLocaleString();

  const cachedColor =
    isCumulative && stats.cachedTokens > 0 ? Colors.AccentGreen : undefined;

  return (
    <Box flexDirection="column" width={COLUMN_WIDTH}>
      <Text bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        <StatRow
          label="Input Tokens"
          value={stats.inputTokens.toLocaleString()}
        />
        <StatRow
          label="Output Tokens"
          value={stats.outputTokens.toLocaleString()}
        />
        <StatRow
          label="Tool Use Tokens"
          value={stats.toolUseTokens.toLocaleString()}
        />
        <StatRow
          label="Thoughts Tokens"
          value={stats.thoughtsTokens.toLocaleString()}
        />
        <StatRow
          label="Cached Tokens"
          value={cachedDisplay}
          valueColor={cachedColor}
        />
        {/* Divider Line */}
        <Box
          borderTop={true}
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderStyle="single"
        />
        <StatRow
          label="Total Tokens"
          value={stats.totalTokens.toLocaleString()}
        />
      </Box>
    </Box>
  );
};

// --- Main Component ---

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  stats,
  lastTurnStats,
  duration,
}) => {
  const lastTurnFormatted: FormattedStats = {
    inputTokens: lastTurnStats.promptTokenCount,
    outputTokens: lastTurnStats.candidatesTokenCount,
    toolUseTokens: lastTurnStats.toolUsePromptTokenCount,
    thoughtsTokens: lastTurnStats.thoughtsTokenCount,
    cachedTokens: lastTurnStats.cachedContentTokenCount,
    totalTokens: lastTurnStats.totalTokenCount,
  };

  const cumulativeFormatted: FormattedStats = {
    inputTokens: stats.promptTokenCount,
    outputTokens: stats.candidatesTokenCount,
    toolUseTokens: stats.toolUsePromptTokenCount,
    thoughtsTokens: stats.thoughtsTokenCount,
    cachedTokens: stats.cachedContentTokenCount,
    totalTokens: stats.totalTokenCount,
  };

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      <Text bold color={Colors.AccentPurple}>
        Stats
      </Text>

      <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
        <StatsColumn title="Last Turn" stats={lastTurnFormatted} />
        <StatsColumn
          title={`Cumulative (${stats.turnCount} Turns)`}
          stats={cumulativeFormatted}
          isCumulative={true}
        />
      </Box>

      <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
        {/* Left column for "Last Turn" duration */}
        <Box width={COLUMN_WIDTH} flexDirection="column">
          <StatRow
            label="Turn Duration (API)"
            value={formatDuration(lastTurnStats.apiTimeMs)}
          />
        </Box>

        {/* Right column for "Cumulative" durations */}
        <Box width={COLUMN_WIDTH} flexDirection="column">
          <StatRow
            label="Total duration (API)"
            value={formatDuration(stats.apiTimeMs)}
          />
          <StatRow label="Total duration (wall)" value={duration} />
        </Box>
      </Box>
    </Box>
  );
};
