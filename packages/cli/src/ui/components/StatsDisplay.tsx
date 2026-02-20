/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
import { theme } from '../semantic-colors.js';
import { formatDuration, formatResetTime } from '../utils/formatters.js';
import type { ModelMetrics } from '../contexts/SessionContext.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
  CACHE_EFFICIENCY_HIGH,
  CACHE_EFFICIENCY_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import {
  type RetrieveUserQuotaResponse,
  isActiveModel,
  getDisplayString,
  isAutoModel,
  AuthType,
} from '@google/gemini-cli-core';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { QuotaStats } from '../types.js';
import { QuotaStatsInfo } from './QuotaStatsInfo.js';

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
const buildModelRows = (
  models: Record<string, ModelMetrics>,
  quotas?: RetrieveUserQuotaResponse,
  useGemini3_1 = false,
  useCustomToolModel = false,
) => {
  const getBaseModelName = (name: string) => name.replace('-001', '');
  const usedModelNames = new Set(Object.keys(models).map(getBaseModelName));

  // 1. Models with active usage
  const activeRows = Object.entries(models).map(([name, metrics]) => {
    const modelName = getBaseModelName(name);
    const cachedTokens = metrics.tokens.cached;
    const inputTokens = metrics.tokens.input;
    return {
      key: name,
      modelName: getDisplayString(modelName),
      requests: metrics.api.totalRequests,
      cachedTokens: cachedTokens.toLocaleString(),
      inputTokens: inputTokens.toLocaleString(),
      outputTokens: metrics.tokens.candidates.toLocaleString(),
      bucket: quotas?.buckets?.find((b) => b.modelId === modelName),
      isActive: true,
    };
  });

  // 2. Models with quota only
  const quotaRows =
    quotas?.buckets
      ?.filter(
        (b) =>
          b.modelId &&
          isActiveModel(b.modelId, useGemini3_1, useCustomToolModel) &&
          !usedModelNames.has(b.modelId),
      )
      .map((bucket) => ({
        key: bucket.modelId!,
        modelName: getDisplayString(bucket.modelId!),
        requests: '-',
        cachedTokens: '-',
        inputTokens: '-',
        outputTokens: '-',
        bucket,
        isActive: false,
      })) || [];

  return [...activeRows, ...quotaRows];
};

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  quotas?: RetrieveUserQuotaResponse;
  cacheEfficiency: number;
  totalCachedTokens: number;
  currentModel?: string;
  pooledRemaining?: number;
  pooledLimit?: number;
  pooledResetTime?: string;
  useGemini3_1?: boolean;
  useCustomToolModel?: boolean;
}> = ({
  models,
  quotas,
  cacheEfficiency,
  totalCachedTokens,
  currentModel,
  pooledRemaining,
  pooledLimit,
  pooledResetTime,
  useGemini3_1,
  useCustomToolModel,
}) => {
  const rows = buildModelRows(models, quotas, useGemini3_1, useCustomToolModel);

  const isAuto = currentModel && isAutoModel(currentModel);
  const modelUsageTitle = isAuto
    ? `${getDisplayString(currentModel)} Usage`
    : `Model Usage`;

  const showQuotaColumn = !!quotas;

  const modelColumnWidth = 30;
  const requestsColumnWidth = 8;
  const tokenColumnWidth = 15;

  const cacheEfficiencyColor = getStatusColor(cacheEfficiency, {
    green: CACHE_EFFICIENCY_HIGH,
    yellow: CACHE_EFFICIENCY_MEDIUM,
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box>
        <Text bold color={theme.text.primary} wrap="truncate-end">
          {modelUsageTitle}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={0} marginBottom={1}>
        <QuotaStatsInfo
          remaining={pooledRemaining}
          limit={pooledLimit}
          resetTime={pooledResetTime}
          showDetails={true}
          quotas={quotas}
          useGemini3_1={useGemini3_1}
          useCustomToolModel={useCustomToolModel}
        />
        {isAuto && (
          <Text color={theme.text.primary}>
            For a full token breakdown, run `/stats model`.
          </Text>
        )}
      </Box>

      <Box>
        <Box width={modelColumnWidth}>
          <Text bold color={theme.text.primary}>
            Model
          </Text>
        </Box>
        <Box width={requestsColumnWidth} justifyContent="flex-end">
          <Text bold color={theme.text.primary}>
            Reqs
          </Text>
        </Box>

        {!showQuotaColumn && (
          <>
            <Box width={tokenColumnWidth} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Input Tokens
              </Text>
            </Box>
            <Box width={tokenColumnWidth} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Cache Reads
              </Text>
            </Box>
            <Box width={tokenColumnWidth} justifyContent="flex-end">
              <Text bold color={theme.text.primary}>
                Output Tokens
              </Text>
            </Box>
          </>
        )}
        {showQuotaColumn && (
          <Box flexGrow={1} justifyContent="flex-end">
            <Text bold color={theme.text.primary}>
              Usage left
            </Text>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        marginBottom={0}
      />

      {rows.length > 0 ? (
        rows.map((row) => (
          <Box key={row.key}>
            <Box width={modelColumnWidth}>
              <Text
                color={row.isActive ? theme.text.primary : theme.text.secondary}
                wrap="truncate-end"
              >
                {row.modelName}
              </Text>
            </Box>
            <Box width={requestsColumnWidth} justifyContent="flex-end">
              <Text
                color={row.isActive ? theme.text.primary : theme.text.secondary}
              >
                {row.requests}
              </Text>
            </Box>
            {!showQuotaColumn && (
              <>
                <Box width={tokenColumnWidth} justifyContent="flex-end">
                  <Text
                    color={
                      row.isActive ? theme.text.primary : theme.text.secondary
                    }
                  >
                    {row.inputTokens}
                  </Text>
                </Box>
                <Box width={tokenColumnWidth} justifyContent="flex-end">
                  <Text
                    color={
                      row.isActive ? theme.text.primary : theme.text.secondary
                    }
                  >
                    {row.cachedTokens}
                  </Text>
                </Box>
                <Box width={tokenColumnWidth} justifyContent="flex-end">
                  <Text
                    color={
                      row.isActive ? theme.text.primary : theme.text.secondary
                    }
                  >
                    {row.outputTokens}
                  </Text>
                </Box>
              </>
            )}
            {showQuotaColumn && (
              <Box flexGrow={1} justifyContent="flex-end">
                {row.bucket && row.bucket.remainingFraction != null && (
                  <Text
                    color={
                      row.isActive ? theme.text.primary : theme.text.secondary
                    }
                  >
                    {(row.bucket.remainingFraction * 100).toFixed(1)}%
                    {row.bucket.resetTime && (
                      <Text color={theme.text.secondary}>
                        {' '}
                        (
                        {formatResetTime(row.bucket.resetTime, {
                          capitalize: true,
                        })}
                        )
                      </Text>
                    )}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        ))
      ) : (
        <Box>
          <Text color={theme.text.secondary}>No model usage recorded.</Text>
        </Box>
      )}

      {cacheEfficiency > 0 && !showQuotaColumn && rows.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.primary}>
            <Text color={theme.status.success}>Savings Highlight:</Text>{' '}
            {totalCachedTokens.toLocaleString()} (
            <Text color={cacheEfficiencyColor}>
              {cacheEfficiency.toFixed(1)}%
            </Text>
            ) of input tokens were served from the cache, reducing costs.
          </Text>
        </Box>
      )}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
  quotas?: RetrieveUserQuotaResponse;
  footer?: string;
  selectedAuthType?: string;
  userEmail?: string;
  tier?: string;
  currentModel?: string;
  quotaStats?: QuotaStats;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
  quotas,
  footer,
  selectedAuthType,
  userEmail,
  tier,
  currentModel,
  quotaStats,
}) => {
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models, tools, files } = metrics;
  const computed = computeSessionStats(metrics);
  const settings = useSettings();
  const config = useConfig();
  const useGemini3_1 = config.getGemini31LaunchedSync?.() ?? false;
  const useCustomToolModel =
    useGemini3_1 &&
    config.getContentGeneratorConfig().authType === AuthType.USE_GEMINI;
  const pooledRemaining = quotaStats?.remaining;
  const pooledLimit = quotaStats?.limit;
  const pooledResetTime = quotaStats?.resetTime;

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
                  ? `Logged in with Google (${userEmail})`
                  : 'Logged in with Google'
                : selectedAuthType}
            </Text>
          </StatRow>
        )}
        {showUserIdentity && tier && (
          <StatRow title="Tier:">
            <Text color={theme.text.primary}>{tier}</Text>
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
      <ModelUsageTable
        models={models}
        quotas={quotas}
        cacheEfficiency={computed.cacheEfficiency}
        totalCachedTokens={computed.totalCachedTokens}
        currentModel={currentModel}
        pooledRemaining={pooledRemaining}
        pooledLimit={pooledLimit}
        pooledResetTime={pooledResetTime}
        useGemini3_1={useGemini3_1}
        useCustomToolModel={useCustomToolModel}
      />
      {renderFooter()}
    </Box>
  );
};
