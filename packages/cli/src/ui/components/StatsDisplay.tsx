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
import { useSessionStats, ModelMetrics } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';

// A more flexible and powerful StatRow component
interface StatRowProps {
  title: string;
  children: React.ReactNode; // Use children to allow for complex, colored values
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    {/* Fixed width for the label creates a clean "gutter" for alignment */}
    <Box width={28}>
      <Text color={Colors.LightBlue}>{title}</Text>
    </Box>
    {children}
  </Box>
);

// A SubStatRow for indented, secondary information
interface SubStatRowProps {
  title: string;
  children: React.ReactNode;
}

const SubStatRow: React.FC<SubStatRowProps> = ({ title, children }) => (
  <Box paddingLeft={2}>
    {/* Adjust width for the "» " prefix */}
    <Box width={26}>
      <Text>» {title}</Text>
    </Box>
    {children}
  </Box>
);

// A Section component to group related stats
interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <Box flexDirection="column" width="100%" marginBottom={1}>
    <Text bold>{title}</Text>
    {children}
  </Box>
);

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  totalCachedTokens: number;
  cacheEfficiency: number;
}> = ({ models, totalCachedTokens, cacheEfficiency }) => {
  const nameWidth = 25;
  const requestsWidth = 8;
  const inputTokensWidth = 15;
  const outputTokensWidth = 15;

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box>
        <Box width={nameWidth}>
          <Text bold>Model Usage</Text>
        </Box>
        <Box width={requestsWidth} justifyContent="flex-end">
          <Text bold>Reqs</Text>
        </Box>
        <Box width={inputTokensWidth} justifyContent="flex-end">
          <Text bold>Input Tokens</Text>
        </Box>
        <Box width={outputTokensWidth} justifyContent="flex-end">
          <Text bold>Output Tokens</Text>
        </Box>
      </Box>
      {/* Divider */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        width={nameWidth + requestsWidth + inputTokensWidth + outputTokensWidth}
      ></Box>

      {/* Rows */}
      {Object.entries(models).map(([name, modelMetrics]) => (
        <Box key={name}>
          <Box width={nameWidth}>
            <Text>{name.replace('-001', '')}</Text>
          </Box>
          <Box width={requestsWidth} justifyContent="flex-end">
            <Text>{modelMetrics.api.totalRequests}</Text>
          </Box>
          <Box width={inputTokensWidth} justifyContent="flex-end">
            <Text color={Colors.AccentYellow}>
              {modelMetrics.tokens.prompt.toLocaleString()}
            </Text>
          </Box>
          <Box width={outputTokensWidth} justifyContent="flex-end">
            <Text color={Colors.AccentYellow}>
              {modelMetrics.tokens.candidates.toLocaleString()}
            </Text>
          </Box>
        </Box>
      ))}
      {cacheEfficiency > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={Colors.AccentGreen}>Savings Highlight:</Text>{' '}
            {totalCachedTokens.toLocaleString()} ({cacheEfficiency.toFixed(1)}
            %) of input tokens were served from the cache, reducing costs.
          </Text>
          <Box height={1} />
          <Text color={Colors.Gray}>
            » Tip: For a full token breakdown, run `/stats model`.
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models, tools } = metrics;
  const computed = computeSessionStats(metrics);

  const successThresholds = {
    green: TOOL_SUCCESS_RATE_HIGH,
    yellow: TOOL_SUCCESS_RATE_MEDIUM,
  };
  const agreementThresholds = {
    green: USER_AGREEMENT_RATE_HIGH,
    yellow: USER_AGREEMENT_RATE_MEDIUM,
  };
  const successColor = getStatusColor(computed.successRate, successThresholds);
  const agreementColor = getStatusColor(
    computed.agreementRate,
    agreementThresholds,
  );

  const renderTitle = () => {
    if (title) {
      return Colors.GradientColors && Colors.GradientColors.length > 0 ? (
        <Gradient colors={Colors.GradientColors}>
          <Text bold>{title}</Text>
        </Gradient>
      ) : (
        <Text bold color={Colors.AccentPurple}>
          {title}
        </Text>
      );
    }
    return (
      <Text bold color={Colors.AccentPurple}>
        Session Stats
      </Text>
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      {renderTitle()}
      <Box height={1} />

      {tools.totalCalls > 0 && (
        <Section title="Interaction Summary">
          <StatRow title="Tool Calls:">
            <Text>
              {tools.totalCalls} ({' '}
              <Text color={Colors.AccentGreen}>✔ {tools.totalSuccess}</Text>{' '}
              <Text color={Colors.AccentRed}>✖ {tools.totalFail}</Text> )
            </Text>
          </StatRow>
          <StatRow title="Success Rate:">
            <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
          </StatRow>
          {computed.totalDecisions > 0 && (
            <StatRow title="User Agreement:">
              <Text color={agreementColor}>
                {computed.agreementRate.toFixed(1)}%{' '}
                <Text color={Colors.Gray}>
                  ({computed.totalDecisions} reviewed)
                </Text>
              </Text>
            </StatRow>
          )}
        </Section>
      )}

      <Section title="Performance">
        <StatRow title="Wall Time:">
          <Text>{duration}</Text>
        </StatRow>
        <StatRow title="Agent Active:">
          <Text>{formatDuration(computed.agentActiveTime)}</Text>
        </StatRow>
        <SubStatRow title="API Time:">
          <Text>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title="Tool Time:">
          <Text>
            {formatDuration(computed.totalToolTime)}{' '}
            <Text color={Colors.Gray}>
              ({computed.toolTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
      </Section>

      {Object.keys(models).length > 0 && (
        <ModelUsageTable
          models={models}
          totalCachedTokens={computed.totalCachedTokens}
          cacheEfficiency={computed.cacheEfficiency}
        />
      )}
    </Box>
  );
};
