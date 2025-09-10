/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatDuration } from '../utils/formatters.js';
import {
  calculateAverageLatency,
  calculateCacheHitRate,
  calculateErrorRate,
} from '../utils/computeStats.js';
import type { ModelMetrics } from '../contexts/SessionContext.js';
import { useSessionStats } from '../contexts/SessionContext.js';

const METRIC_COL_WIDTH = 28;
const MODEL_COL_WIDTH = 22;

interface StatRowProps {
  title: string;
  values: Array<string | React.ReactElement>;
  isSubtle?: boolean;
  isSection?: boolean;
}

const StatRow: React.FC<StatRowProps> = ({
  title,
  values,
  isSubtle = false,
  isSection = false,
}) => (
  <Box>
    <Box width={METRIC_COL_WIDTH}>
      <Text
        bold={isSection}
        color={isSection ? theme.text.primary : theme.text.link}
      >
        {isSubtle ? `  ↳ ${title}` : title}
      </Text>
    </Box>
    {values.map((value, index) => (
      <Box width={MODEL_COL_WIDTH} key={index}>
        <Text color={theme.text.primary}>{value}</Text>
      </Box>
    ))}
  </Box>
);

export const ModelStatsDisplay: React.FC = () => {
  const { stats } = useSessionStats();
  const { models } = stats.metrics;
  const activeModels = Object.entries(models).filter(
    ([, metrics]) => metrics.api.totalRequests > 0,
  );

  if (activeModels.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingY={1}
        paddingX={2}
      >
        <Text color={theme.text.primary}>
          No API calls have been made in this session.
        </Text>
      </Box>
    );
  }

  const modelNames = activeModels.map(([name]) => name);

  const getModelValues = (
    getter: (metrics: ModelMetrics) => string | React.ReactElement,
  ) => activeModels.map(([, metrics]) => getter(metrics));

  const hasThoughts = activeModels.some(
    ([, metrics]) => metrics.tokens.thoughts > 0,
  );
  const hasTool = activeModels.some(([, metrics]) => metrics.tokens.tool > 0);
  const hasCached = activeModels.some(
    ([, metrics]) => metrics.tokens.cached > 0,
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      <Text bold color={theme.text.accent}>
        Model Stats For Nerds
      </Text>
      <Box height={1} />

      {/* Header */}
      <Box>
        <Box width={METRIC_COL_WIDTH}>
          <Text bold color={theme.text.primary}>
            Metric
          </Text>
        </Box>
        {modelNames.map((name) => (
          <Box width={MODEL_COL_WIDTH} key={name}>
            <Text bold color={theme.text.primary}>
              {name}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
      />

      {/* API Section */}
      <StatRow title="API" values={[]} isSection />
      <StatRow
        title="Requests"
        values={getModelValues((m) => m.api.totalRequests.toLocaleString())}
      />
      <StatRow
        title="Errors"
        values={getModelValues((m) => {
          const errorRate = calculateErrorRate(m);
          return (
            <Text
              color={
                m.api.totalErrors > 0 ? theme.status.error : theme.text.primary
              }
            >
              {m.api.totalErrors.toLocaleString()} ({errorRate.toFixed(1)}%)
            </Text>
          );
        })}
      />
      <StatRow
        title="Avg Latency"
        values={getModelValues((m) => {
          const avgLatency = calculateAverageLatency(m);
          return formatDuration(avgLatency);
        })}
      />

      <Box height={1} />

      {/* Tokens Section */}
      <StatRow title="Tokens" values={[]} isSection />
      <StatRow
        title="Total"
        values={getModelValues((m) => (
          <Text color={theme.status.warning}>
            {m.tokens.total.toLocaleString()}
          </Text>
        ))}
      />
      <StatRow
        title="Prompt"
        isSubtle
        values={getModelValues((m) => m.tokens.prompt.toLocaleString())}
      />
      {hasCached && (
        <StatRow
          title="Cached"
          isSubtle
          values={getModelValues((m) => {
            const cacheHitRate = calculateCacheHitRate(m);
            return (
              <Text color={theme.status.success}>
                {m.tokens.cached.toLocaleString()} ({cacheHitRate.toFixed(1)}%)
              </Text>
            );
          })}
        />
      )}
      {hasThoughts && (
        <StatRow
          title="Thoughts"
          isSubtle
          values={getModelValues((m) => m.tokens.thoughts.toLocaleString())}
        />
      )}
      {hasTool && (
        <StatRow
          title="Tool"
          isSubtle
          values={getModelValues((m) => m.tokens.tool.toLocaleString())}
        />
      )}
      <StatRow
        title="Output"
        isSubtle
        values={getModelValues((m) => m.tokens.candidates.toLocaleString())}
      />
    </Box>
  );
};
