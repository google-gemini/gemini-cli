/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import {
  useSessionStats,
  type ModelMetrics,
} from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import { useSettings } from '../contexts/SettingsContext.js';
import type { QuotaStats } from '../types.js';

// A more flexible and powerful StatRow component
interface StatRowProps {
  title: string;
  children: React.ReactNode; // Use children to allow for complex, colored values
}

const StatRow: React.FC<StatRowProps> = ({ title, children }) => (
  <Box>
    {/* Fixed width for the label creates a clean "gutter" for alignment */}
    <Box width={28}>
      <Text color={theme.text.link}>{title}</Text>
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
      <Text color={theme.text.secondary}>» {title}</Text>
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
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color={theme.text.primary}>
      {title}
    </Text>
    {children}
  </Box>
);

// Logic for building the unified list of table rows

interface ModelUsageTableProps {
  models: Record<string, ModelMetrics>;
}

const ModelUsageTable: React.FC<ModelUsageTableProps> = ({ models }) => {
  const nameWidth = 28;
  const requestsWidth = 8;
  const inputTokensWidth = 14;
  const cacheReadsWidth = 14;
  const outputTokensWidth = 14;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={theme.text.primary}>
        Model Usage
      </Text>
      <Text color={theme.text.secondary}>
        Use /model to view model quota information
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box
        borderBottom={true}
        borderStyle="single"
        borderColor={theme.border.default}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      >
        <Box width={nameWidth}>
          <Text bold color={theme.text.secondary}>
            Model
          </Text>
        </Box>
        <Box width={requestsWidth} justifyContent="flex-end">
          <Text bold color={theme.text.secondary}>
            Reqs
          </Text>
        </Box>
        <Box width={inputTokensWidth} justifyContent="flex-end">
          <Text bold color={theme.text.secondary}>
            Input Tokens
          </Text>
        </Box>
        <Box width={cacheReadsWidth} justifyContent="flex-end">
          <Text bold color={theme.text.secondary}>
            Cache Reads
          </Text>
        </Box>
        <Box width={outputTokensWidth} justifyContent="flex-end">
          <Text bold color={theme.text.secondary}>
            Output Tokens
          </Text>
        </Box>
      </Box>

      {/* Rows */}
      {Object.entries(models).map(([name, modelMetrics]) => (
        <Box key={name}>
          <Box width={nameWidth}>
            <Text color={theme.text.primary} wrap="truncate-end">
              {name}
            </Text>
          </Box>
          <Box width={requestsWidth} justifyContent="flex-end">
            <Text color={theme.text.primary}>
              {modelMetrics.api.totalRequests}
            </Text>
          </Box>
          <Box width={inputTokensWidth} justifyContent="flex-end">
            <Text color={theme.text.primary}>
              {modelMetrics.tokens.prompt.toLocaleString()}
            </Text>
          </Box>
          <Box width={cacheReadsWidth} justifyContent="flex-end">
            <Text color={theme.text.primary}>
              {modelMetrics.tokens.cached.toLocaleString()}
            </Text>
          </Box>
          <Box width={outputTokensWidth} justifyContent="flex-end">
            <Text color={theme.text.primary}>
              {modelMetrics.tokens.candidates.toLocaleString()}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
  footer?: string;
  selectedAuthType?: string;
  userEmail?: string;
  tier?: string;
  currentModel?: string;
  quotaStats?: QuotaStats;
  creditBalance?: number;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
  footer,
  selectedAuthType,
  userEmail,
  tier,
  creditBalance,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { tools, files, models } = metrics;
  const computed = computeSessionStats(metrics);
  const settings = useSettings();

  const showUserIdentity = settings.merged.ui.showUserIdentity;

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
      return <ThemedGradient bold>{title}</ThemedGradient>;
    }
    return (
      <Text bold color={theme.text.accent}>
        Session Stats
      </Text>
    );
  };

  const renderFooter = () => {
    if (!footer) {
      return null;
    }
    return <ThemedGradient bold>{footer}</ThemedGradient>;
  };

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
      overflow="hidden"
    >
      {renderTitle()}
      <Box height={1} />

      <Section title="Interaction Summary">
        <StatRow title="Session ID:">
          <Text color={theme.text.primary}>{stats.sessionId}</Text>
        </StatRow>
        {showUserIdentity && selectedAuthType && (
          <StatRow title="Auth Method:">
            <Text color={theme.text.primary}>
              {selectedAuthType.startsWith('oauth')
                ? userEmail
                  ? `Signed in with Google (${userEmail})`
                  : 'Signed in with Google'
                : selectedAuthType}
            </Text>
          </StatRow>
        )}
        {showUserIdentity && tier && (
          <StatRow title="Tier:">
            <Text color={theme.text.primary}>{tier}</Text>
          </StatRow>
        )}
        {showUserIdentity && creditBalance != null && creditBalance >= 0 && (
          <StatRow title="Google AI Credits:">
            <Text
              color={
                creditBalance > 0 ? theme.text.primary : theme.text.secondary
              }
            >
              {creditBalance.toLocaleString()}
            </Text>
          </StatRow>
        )}
        <StatRow title="Tool Calls:">
          <Text color={theme.text.primary}>
            {tools.totalCalls} ({' '}
            <Text color={theme.status.success}>✓ {tools.totalSuccess}</Text>{' '}
            <Text color={theme.status.error}>x {tools.totalFail}</Text> )
          </Text>
        </StatRow>
        <StatRow title="Success Rate:">
          <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
        </StatRow>
        {computed.totalDecisions > 0 && (
          <StatRow title="User Agreement:">
            <Text color={agreementColor}>
              {computed.agreementRate.toFixed(1)}%{' '}
              <Text color={theme.text.secondary}>
                ({computed.totalDecisions} reviewed)
              </Text>
            </Text>
          </StatRow>
        )}
        {files &&
          (files.totalLinesAdded > 0 || files.totalLinesRemoved > 0) && (
            <StatRow title="Code Changes:">
              <Text color={theme.text.primary}>
                <Text color={theme.status.success}>
                  +{files.totalLinesAdded}
                </Text>{' '}
                <Text color={theme.status.error}>
                  -{files.totalLinesRemoved}
                </Text>
              </Text>
            </StatRow>
          )}
      </Section>

      <Section title="Performance">
        <StatRow title="Wall Time:">
          <Text color={theme.text.primary}>{duration}</Text>
        </StatRow>
        <StatRow title="Agent Active:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.agentActiveTime)}
          </Text>
        </StatRow>
        <SubStatRow title="API Time:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={theme.text.secondary}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title="Tool Time:">
          <Text color={theme.text.primary}>
            {formatDuration(computed.totalToolTime)}{' '}
            <Text color={theme.text.secondary}>
              ({computed.toolTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
      </Section>

      {Object.keys(models).length > 0 && <ModelUsageTable models={models} />}

      {renderFooter()}
    </Box>
  );
};
