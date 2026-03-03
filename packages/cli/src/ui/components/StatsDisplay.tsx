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
  DiscoveredMCPTool,
} from '@google/gemini-cli-core';
import { useSettings } from '../contexts/SettingsContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { QuotaStats, StartupPhaseMetric } from '../types.js';
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
  const usedModelNames = new Set(
    Object.keys(models).map(getBaseModelName).map(getDisplayString),
  );

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
          !usedModelNames.has(getDisplayString(b.modelId)),
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

  if (rows.length === 0) {
    return null;
  }

  const showQuotaColumn = !!quotas && rows.some((row) => !!row.bucket);

  const nameWidth = 25;
  const requestsWidth = 7;
  const uncachedWidth = 15;
  const cachedWidth = 14;
  const outputTokensWidth = 15;
  const usageLimitWidth = showQuotaColumn ? 28 : 0;

  const cacheEfficiencyColor = getStatusColor(cacheEfficiency, {
    green: CACHE_EFFICIENCY_HIGH,
    yellow: CACHE_EFFICIENCY_MEDIUM,
  });

  const totalWidth =
    nameWidth +
    requestsWidth +
    (showQuotaColumn
      ? usageLimitWidth
      : uncachedWidth + cachedWidth + outputTokensWidth);

  const isAuto = currentModel && isAutoModel(currentModel);
  const modelUsageTitle = isAuto
    ? `${getDisplayString(currentModel)} Usage`
    : `Model Usage`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Box alignItems="flex-end">
        <Box width={nameWidth}>
          <Text bold color={theme.text.primary} wrap="truncate-end">
            {modelUsageTitle}
          </Text>
        </Box>
      </Box>

      {isAuto &&
        showQuotaColumn &&
        pooledRemaining !== undefined &&
        pooledLimit !== undefined &&
        pooledLimit > 0 && (
          <Box flexDirection="column" marginTop={0} marginBottom={1}>
            <QuotaStatsInfo
              remaining={pooledRemaining}
              limit={pooledLimit}
              resetTime={pooledResetTime}
            />
            <Text color={theme.text.primary}>
              For a full token breakdown, run `/stats model`.
            </Text>
          </Box>
        )}

      <Box alignItems="flex-end">
        <Box width={nameWidth}>
          <Text bold color={theme.text.primary}>
            Model
          </Text>
        </Box>
        <Box
          width={requestsWidth}
          flexDirection="column"
          alignItems="flex-end"
          flexShrink={0}
        >
          <Text bold color={theme.text.primary}>
            Reqs
          </Text>
        </Box>

        {!showQuotaColumn && (
          <>
            <Box
              width={uncachedWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Input Tokens
              </Text>
            </Box>
            <Box
              width={cachedWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Cache Reads
              </Text>
            </Box>
            <Box
              width={outputTokensWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                Output Tokens
              </Text>
            </Box>
          </>
        )}
        {showQuotaColumn && (
          <Box
            width={usageLimitWidth}
            flexDirection="column"
            alignItems="flex-end"
          >
            <Text bold color={theme.text.primary}>
              Usage remaining
            </Text>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="round"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width={totalWidth}
      ></Box>

      {rows.map((row) => (
        <Box key={row.key}>
          <Box width={nameWidth}>
            <Text
              color={row.isActive ? theme.text.primary : theme.text.secondary}
              wrap="truncate-end"
            >
              {row.modelName}
            </Text>
          </Box>
          <Box
            width={requestsWidth}
            flexDirection="column"
            alignItems="flex-end"
            flexShrink={0}
          >
            <Text
              color={row.isActive ? theme.text.primary : theme.text.secondary}
            >
              {row.requests}
            </Text>
          </Box>
          {!showQuotaColumn && (
            <>
              <Box
                width={uncachedWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
                <Text
                  color={
                    row.isActive ? theme.text.primary : theme.text.secondary
                  }
                >
                  {row.inputTokens}
                </Text>
              </Box>
              <Box
                width={cachedWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
                <Text color={theme.text.secondary}>{row.cachedTokens}</Text>
              </Box>
              <Box
                width={outputTokensWidth}
                flexDirection="column"
                alignItems="flex-end"
                flexShrink={0}
              >
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
          <Box
            width={usageLimitWidth}
            flexDirection="column"
            alignItems="flex-end"
          >
            {row.bucket &&
              row.bucket.remainingFraction != null &&
              row.bucket.resetTime && (
                <Text color={theme.text.secondary} wrap="truncate-end">
                  {(row.bucket.remainingFraction * 100).toFixed(1)}%{' '}
                  {formatResetTime(row.bucket.resetTime)}
                </Text>
              )}
          </Box>
        </Box>
      ))}

      {cacheEfficiency > 0 && !showQuotaColumn && (
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

interface ToolProfileSummary {
  name: string;
  category: string;
  toolCall: string;
  calls: number;
  avgDurationMs: number;
  totalDurationMs: number;
  successRate: number;
}

const getPerMinuteRate = (count: number, wallTimeMs: number): number => {
  if (wallTimeMs <= 0) {
    return 0;
  }
  return count / (wallTimeMs / 60000);
};

const formatPhaseName = (phaseName: string): string =>
  phaseName.replaceAll('_', ' ');

const splitToolName = (
  name: string,
): { category: string; toolCall: string } => {
  const firstDot = name.indexOf('.');
  if (firstDot <= 0) {
    return { category: 'core', toolCall: name };
  }

  return {
    category: name.slice(0, firstDot),
    toolCall: name.slice(firstDot + 1),
  };
};

const getToolCategorization = (
  toolName: string,
  config: ReturnType<typeof useConfig>,
): { category: string; toolCall: string } => {
  const tool = config.getToolRegistry()?.getTool(toolName);
  if (tool instanceof DiscoveredMCPTool) {
    return { category: tool.serverName, toolCall: toolName };
  }

  return splitToolName(toolName);
};

interface StatsDisplayProps {
  duration: string;
  wallTimeMs?: number;
  title?: string;
  quotas?: RetrieveUserQuotaResponse;
  footer?: string;
  selectedAuthType?: string;
  userEmail?: string;
  tier?: string;
  currentModel?: string;
  quotaStats?: QuotaStats;
  creditBalance?: number;
  startupPhases?: StartupPhaseMetric[];
  showPerformanceProfile?: boolean;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  wallTimeMs,
  title,
  quotas,
  footer,
  selectedAuthType,
  userEmail,
  tier,
  currentModel,
  quotaStats,
  creditBalance,
  startupPhases,
  showPerformanceProfile = false,
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
  const effectiveWallTimeMs =
    wallTimeMs ?? Math.max(0, Date.now() - stats.sessionStartTime.getTime());
  const totalApiRequests = Object.values(models).reduce(
    (acc, model) => acc + model.api.totalRequests,
    0,
  );
  const promptsPerMinute = getPerMinuteRate(
    stats.promptCount,
    effectiveWallTimeMs,
  );
  const toolsPerMinute = getPerMinuteRate(
    tools.totalCalls,
    effectiveWallTimeMs,
  );
  const apiRequestsPerMinute = getPerMinuteRate(
    totalApiRequests,
    effectiveWallTimeMs,
  );

  const sortedStartupPhases = [...(startupPhases ?? [])]
    .filter((phase) => phase.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs);
  const totalStartupMs = sortedStartupPhases.reduce(
    (acc, phase) => acc + phase.durationMs,
    0,
  );
  const topStartupPhases = sortedStartupPhases.slice(0, 3);
  const slowestStartupPhase = topStartupPhases[0];

  const toolProfiles: ToolProfileSummary[] = Object.entries(tools.byName)
    .filter(([, toolStats]) => toolStats.count > 0)
    .map(([name, toolStats]) => {
      const { category, toolCall } = getToolCategorization(name, config);
      return {
        name,
        category,
        toolCall,
        calls: toolStats.count,
        avgDurationMs: toolStats.durationMs / toolStats.count,
        totalDurationMs: toolStats.durationMs,
        successRate: (toolStats.success / toolStats.count) * 100,
      };
    })
    .sort((a, b) => {
      const byCategory = a.category.localeCompare(b.category);
      if (byCategory !== 0) {
        return byCategory;
      }
      return b.totalDurationMs - a.totalDurationMs;
    });

  const modelPerformanceRows = Object.entries(models)
    .filter(([, modelMetrics]) => modelMetrics.api.totalRequests > 0)
    .map(([modelName, modelMetrics]) => {
      const requests = modelMetrics.api.totalRequests;
      const errors = modelMetrics.api.totalErrors;
      const errorRate = requests > 0 ? (errors / requests) * 100 : 0;
      const avgLatencyMs =
        requests > 0 ? modelMetrics.api.totalLatencyMs / requests : 0;

      return {
        modelKey: modelName,
        modelName: getDisplayString(modelName.replace('-001', '')),
        requests,
        errors,
        errorRate,
        avgLatencyMs,
      };
    });

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
      {showPerformanceProfile && (
        <Section title="Throughput">
          <StatRow title="Prompts:">
            <Text color={theme.text.primary}>
              {stats.promptCount.toLocaleString()}
            </Text>
          </StatRow>
          <StatRow title="API Requests:">
            <Text color={theme.text.primary}>
              {totalApiRequests.toLocaleString()}
            </Text>
          </StatRow>
          <SubStatRow title="Prompts / min:">
            <Text color={theme.text.primary}>
              {promptsPerMinute.toFixed(2)}
            </Text>
          </SubStatRow>
          <SubStatRow title="Tool Calls / min:">
            <Text color={theme.text.primary}>{toolsPerMinute.toFixed(2)}</Text>
          </SubStatRow>
          <SubStatRow title="API Reqs / min:">
            <Text color={theme.text.primary}>
              {apiRequestsPerMinute.toFixed(2)}
            </Text>
          </SubStatRow>
        </Section>
      )}
      {showPerformanceProfile && sortedStartupPhases.length > 0 && (
        <Section title="Startup">
          <StatRow title="Startup Total:">
            <Text color={theme.text.primary}>
              {formatDuration(totalStartupMs)}
            </Text>
          </StatRow>
          {topStartupPhases.map((phase) => {
            const phasePercent =
              totalStartupMs > 0
                ? (phase.durationMs / totalStartupMs) * 100
                : 0;
            return (
              <SubStatRow
                key={phase.name}
                title={`${formatPhaseName(phase.name)}:`}
              >
                <Text color={theme.text.primary}>
                  {formatDuration(phase.durationMs)}{' '}
                  <Text color={theme.text.secondary}>
                    ({phasePercent.toFixed(1)}%)
                  </Text>
                </Text>
              </SubStatRow>
            );
          })}
          {slowestStartupPhase && (
            <SubStatRow title="Slowest Phase:">
              <Text color={theme.text.primary}>
                {formatPhaseName(slowestStartupPhase.name)}
              </Text>
            </SubStatRow>
          )}
        </Section>
      )}
      {showPerformanceProfile && toolProfiles.length > 0 && (
        <Section title="Tool Profiling">
          <Box>
            <Box width={18}>
              <Text bold color={theme.text.link}>
                Category
              </Text>
            </Box>
            <Box width={20}>
              <Text bold color={theme.text.link}>
                Tool Call
              </Text>
            </Box>
            <Box width={9} justifyContent="flex-end">
              <Text bold color={theme.text.link}>
                Avg
              </Text>
            </Box>
            <Box width={9} justifyContent="flex-end">
              <Text bold color={theme.text.link}>
                Total
              </Text>
            </Box>
            <Box width={7} justifyContent="flex-end">
              <Text bold color={theme.text.link}>
                Calls
              </Text>
            </Box>
            <Box width={9} justifyContent="flex-end">
              <Text bold color={theme.text.link}>
                Success
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
            width={74}
          />
          {toolProfiles.slice(0, 8).map((tool) => (
            <Box key={tool.name}>
              <Box width={18}>
                <Text color={theme.text.link} wrap="truncate-end">
                  {tool.category}
                </Text>
              </Box>
              <Box width={20}>
                <Text color={theme.text.primary} wrap="truncate-end">
                  {tool.toolCall}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {formatDuration(tool.avgDurationMs)}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {formatDuration(tool.totalDurationMs)}
                </Text>
              </Box>
              <Box width={7} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {tool.calls.toLocaleString()}
                </Text>
              </Box>
              <Box width={9} justifyContent="flex-end">
                <Text color={theme.text.primary}>
                  {tool.successRate.toFixed(1)}%
                </Text>
              </Box>
            </Box>
          ))}
        </Section>
      )}
      {showPerformanceProfile && modelPerformanceRows.length > 0 && (
        <Section title="Model API Performance">
          {modelPerformanceRows.map((row) => (
            <StatRow key={row.modelKey} title={`${row.modelName}:`}>
              <Text color={theme.text.primary}>
                {row.requests.toLocaleString()} reqs,{' '}
                {row.errors.toLocaleString()} errs ({row.errorRate.toFixed(1)}
                %), {formatDuration(row.avgLatencyMs)} avg
              </Text>
            </StatRow>
          ))}
        </Section>
      )}
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
