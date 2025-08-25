/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { formatDuration } from '../utils/formatters.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import type { ToolCallStats } from '@google/gemini-cli-core';

const TOOL_NAME_COL_WIDTH = 25;
const CALLS_COL_WIDTH = 8;
const SUCCESS_RATE_COL_WIDTH = 15;
const AVG_DURATION_COL_WIDTH = 15;

const StatRow: React.FC<{
  name: string;
  stats: ToolCallStats;
}> = ({ name, stats }) => {
  const successRate = stats.count > 0 ? (stats.success / stats.count) * 100 : 0;
  const avgDuration = stats.count > 0 ? stats.durationMs / stats.count : 0;
  const successColor = getStatusColor(successRate, {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  });

  return (
    <Box>
      <Box width={TOOL_NAME_COL_WIDTH}>
        <Text color={Colors.LightBlue}>{name}</Text>
      </Box>
      <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
        <Text>{stats.count}</Text>
      </Box>
      <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
        <Text color={successColor}>{successRate.toFixed(1)}%</Text>
      </Box>
      <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
        <Text>{formatDuration(avgDuration)}</Text>
      </Box>
    </Box>
  );
};

export const ToolStatsDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { tools } = stats.metrics;
  const activeTools = Object.entries(tools.byName).filter(
    ([, metrics]) => metrics.count > 0,
  );

  if (activeTools.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        paddingY={1}
        paddingX={2}
      >
        <Text>No tool calls have been made in this session.</Text>
      </Box>
    );
  }

  const totalDecisions = Object.values(tools.byName).reduce(
    (acc, tool) => {
      acc.accept += tool.decisions.accept;
      acc.reject += tool.decisions.reject;
      acc.modify += tool.decisions.modify;
      return acc;
    },
    { accept: 0, reject: 0, modify: 0 },
  );

  const totalReviewed =
    totalDecisions.accept + totalDecisions.reject + totalDecisions.modify;
  const agreementRate =
    totalReviewed > 0 ? (totalDecisions.accept / totalReviewed) * 100 : 0;
  const agreementColor = getStatusColor(agreementRate, {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      width={70}
    >
      <Text bold color={Colors.AccentPurple}>
        Tool Stats For Nerds
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={TOOL_NAME_COL_WIDTH}>
          <Text bold>Tool Name</Text>
        </Box>
        <Box width={CALLS_COL_WIDTH} justifyContent="flex-end">
          <Text bold>Calls</Text>
        </Box>
        <Box width={SUCCESS_RATE_COL_WIDTH} justifyContent="flex-end">
          <Text bold>Success Rate</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold>Avg Duration</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width="100%"
      />

      {/* Tool Rows */}
      {activeTools.map(([name, stats]) => (
        <StatRow key={name} name={name} stats={stats as ToolCallStats} />
      ))}

      <Box height={1} />

      {/* User Decision Summary */}
      <Text bold>User Decision Summary</Text>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text color={Colors.LightBlue}>Total Reviewed Suggestions:</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text>{totalReviewed}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text> » Accepted:</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentGreen}>{totalDecisions.accept}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text> » Rejected:</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentRed}>{totalDecisions.reject}</Text>
        </Box>
      </Box>
      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text> » Modified:</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text color={Colors.AccentYellow}>{totalDecisions.modify}</Text>
        </Box>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width="100%"
      />

      <Box>
        <Box
          width={TOOL_NAME_COL_WIDTH + CALLS_COL_WIDTH + SUCCESS_RATE_COL_WIDTH}
        >
          <Text> Overall Agreement Rate:</Text>
        </Box>
        <Box width={AVG_DURATION_COL_WIDTH} justifyContent="flex-end">
          <Text bold color={totalReviewed > 0 ? agreementColor : undefined}>
            {totalReviewed > 0 ? `${agreementRate.toFixed(1)}%` : '--'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
