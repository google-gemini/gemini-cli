/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { FormattedStats, StatRow, StatsColumn } from './Stats.js';

// --- Prop and Data Structures ---

interface SessionSummaryDisplayProps {
  duration: string;
}

// --- Main Component ---

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const computed = computeSessionStats(metrics);

  const cumulativeFormatted: FormattedStats = {
    inputTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.prompt,
      0,
    ),
    outputTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.candidates,
      0,
    ),
    toolUseTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.tool,
      0,
    ),
    thoughtsTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.thoughts,
      0,
    ),
    cachedTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.cached,
      0,
    ),
    totalTokens: Object.values(metrics.models).reduce(
      (acc, model) => acc + model.tokens.total,
      0,
    ),
  };

  const totalRequests = Object.values(metrics.models).reduce(
    (acc, model) => acc + model.api.totalRequests,
    0,
  );

  const title = 'Agent powering down. Goodbye!';

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      alignSelf="flex-start"
    >
      <Box marginBottom={1} flexDirection="column">
        {Colors.GradientColors ? (
          <Gradient colors={Colors.GradientColors}>
            <Text bold>{title}</Text>
          </Gradient>
        ) : (
          <Text bold>{title}</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <StatsColumn
          title={`Cumulative Stats (${totalRequests} API calls)`}
          stats={cumulativeFormatted}
          isCumulative={true}
        >
          <Box marginTop={1} flexDirection="column">
            <StatRow
              label="Total duration (API)"
              value={formatDuration(computed.totalApiTime)}
            />
            <StatRow
              label="Total duration (Tools)"
              value={formatDuration(computed.totalToolTime)}
            />
            <StatRow label="Total duration (wall)" value={duration} />
          </Box>
        </StatsColumn>
      </Box>
    </Box>
  );
};
