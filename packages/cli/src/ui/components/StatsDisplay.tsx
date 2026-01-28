/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { ThemedGradient } from './ThemedGradient.js';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import type { ModelMetrics } from '../contexts/SessionContext.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import {
  getStatusColor,
  TOOL_SUCCESS_RATE_HIGH,
  TOOL_SUCCESS_RATE_MEDIUM,
  USER_AGREEMENT_RATE_HIGH,
  USER_AGREEMENT_RATE_MEDIUM,
} from '../utils/displayUtils.js';
import { computeSessionStats } from '../utils/computeStats.js';
import {
  type RetrieveUserQuotaResponse,
  VALID_GEMINI_MODELS,
} from '@google/gemini-cli-core';

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
      modelName,
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
          VALID_GEMINI_MODELS.has(b.modelId) &&
          !usedModelNames.has(b.modelId),
      )
      .map((bucket) => ({
        key: bucket.modelId!,
        modelName: bucket.modelId!,
        requests: '-',
        cachedTokens: '-',
        inputTokens: '-',
        outputTokens: '-',
        bucket,
        isActive: false,
      })) || [];

  return [...activeRows, ...quotaRows];
};

const formatResetTime = (
  resetTime: string,
  tFn: (key: string, options?: Record<string, unknown>) => string,
): string => {
  const diff = new Date(resetTime).getTime() - Date.now();
  if (diff <= 0) return '';

  const totalMinutes = Math.ceil(diff / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const fmt = (val: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat('en', {
      style: 'unit',
      unit,
      unitDisplay: 'narrow',
    }).format(val);

  let time: string;
  if (hours > 0 && minutes > 0) {
    time = `${fmt(hours, 'hour')} ${fmt(minutes, 'minute')}`;
  } else if (hours > 0) {
    time = fmt(hours, 'hour');
  } else {
    time = fmt(minutes, 'minute');
  }

  return `(${tFn('dialogs:stats.resetsIn', { time })})`;
};

const ModelUsageTable: React.FC<{
  models: Record<string, ModelMetrics>;
  quotas?: RetrieveUserQuotaResponse;
  cacheEfficiency: number;
  totalCachedTokens: number;
}> = ({ models, quotas, cacheEfficiency, totalCachedTokens }) => {
  const { t } = useTranslation();
  const rows = buildModelRows(models, quotas);

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

  const totalWidth =
    nameWidth +
    requestsWidth +
    (showQuotaColumn
      ? usageLimitWidth
      : uncachedWidth + cachedWidth + outputTokensWidth);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header */}
      <Box alignItems="flex-end">
        <Box width={nameWidth}>
          <Text bold color={theme.text.primary} wrap="truncate-end">
            {t('dialogs:stats.modelUsage')}
          </Text>
        </Box>
        <Box
          width={requestsWidth}
          flexDirection="column"
          alignItems="flex-end"
          flexShrink={0}
        >
          <Text bold color={theme.text.primary}>
            {t('dialogs:stats.reqs')}
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
                {t('dialogs:stats.inputTokens')}
              </Text>
            </Box>
            <Box
              width={cachedWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                {t('dialogs:stats.cacheReads')}
              </Text>
            </Box>
            <Box
              width={outputTokensWidth}
              flexDirection="column"
              alignItems="flex-end"
              flexShrink={0}
            >
              <Text bold color={theme.text.primary}>
                {t('dialogs:stats.outputTokens')}
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
              {t('dialogs:stats.usageLeft')}
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
            <Text color={theme.text.primary} wrap="truncate-end">
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
                  {formatResetTime(row.bucket.resetTime, t)}
                </Text>
              )}
          </Box>
        </Box>
      ))}

      {cacheEfficiency > 0 && !showQuotaColumn && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.primary}>
            {t('dialogs:stats.cacheSavings', {
              tokens: totalCachedTokens.toLocaleString(),
              percent: `${cacheEfficiency.toFixed(1)}%`,
            })}
          </Text>
        </Box>
      )}

      {showQuotaColumn && (
        <>
          <Box marginTop={1} marginBottom={2}>
            <Text color={theme.text.primary}>
              {t('dialogs:stats.usageLimits')}
            </Text>
          </Box>
          <Text color={theme.text.secondary}>
            {t('dialogs:stats.statsTip')}
          </Text>
        </>
      )}
    </Box>
  );
};

interface StatsDisplayProps {
  duration: string;
  title?: string;
  quotas?: RetrieveUserQuotaResponse;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({
  duration,
  title,
  quotas,
}) => {
  const { t } = useTranslation();
  const { stats } = useSessionStats();
  const { metrics } = stats;
  const { models, tools, files } = metrics;
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
      return <ThemedGradient bold>{title}</ThemedGradient>;
    }
    return (
      <Text bold color={theme.text.accent}>
        {t('dialogs:stats.sessionStats')}
      </Text>
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      overflow="hidden"
    >
      {renderTitle()}
      <Box height={1} />

      <Section title={t('dialogs:stats.interactionSummary')}>
        <StatRow title={t('dialogs:stats.sessionId')}>
          <Text color={theme.text.primary}>{stats.sessionId}</Text>
        </StatRow>
        <StatRow title={t('dialogs:stats.toolCalls')}>
          <Text color={theme.text.primary}>
            {tools.totalCalls} ({' '}
            <Text color={theme.status.success}>✓ {tools.totalSuccess}</Text>{' '}
            <Text color={theme.status.error}>x {tools.totalFail}</Text> )
          </Text>
        </StatRow>
        <StatRow title={t('dialogs:stats.successRate')}>
          <Text color={successColor}>{computed.successRate.toFixed(1)}%</Text>
        </StatRow>
        {computed.totalDecisions > 0 && (
          <StatRow title={t('dialogs:stats.userAgreement')}>
            <Text color={agreementColor}>
              {computed.agreementRate.toFixed(1)}%{' '}
              <Text color={theme.text.secondary}>
                ({computed.totalDecisions} {t('dialogs:stats.reviewed')})
              </Text>
            </Text>
          </StatRow>
        )}
        {files &&
          (files.totalLinesAdded > 0 || files.totalLinesRemoved > 0) && (
            <StatRow title={t('dialogs:stats.codeChanges')}>
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

      <Section title={t('dialogs:stats.performance')}>
        <StatRow title={t('dialogs:stats.wallTime')}>
          <Text color={theme.text.primary}>{duration}</Text>
        </StatRow>
        <StatRow title={t('dialogs:stats.agentActive')}>
          <Text color={theme.text.primary}>
            {formatDuration(computed.agentActiveTime)}
          </Text>
        </StatRow>
        <SubStatRow title={t('dialogs:stats.apiTime')}>
          <Text color={theme.text.primary}>
            {formatDuration(computed.totalApiTime)}{' '}
            <Text color={theme.text.secondary}>
              ({computed.apiTimePercent.toFixed(1)}%)
            </Text>
          </Text>
        </SubStatRow>
        <SubStatRow title={t('dialogs:stats.toolTime')}>
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
      />
    </Box>
  );
};
