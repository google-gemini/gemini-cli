/**
 * @license
 * Copyright 2026 Google LLC
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
import {
  useSessionStats,
  type ModelMetrics,
} from '../contexts/SessionContext.js';
import { Table, type Column } from './Table.js';
import { useSettings } from '../contexts/SettingsContext.js';
import {
  getDisplayString,
  isAutoModel,
  LlmRole,
} from '@google/gemini-cli-core';
import type { QuotaStats } from '../types.js';
import { QuotaStatsInfo } from './QuotaStatsInfo.js';

interface StatRowData {
  metric: string;
  isSection?: boolean;
  isSubtle?: boolean;
  // Dynamic keys for model values
  [key: string]: string | React.ReactNode | boolean | undefined | number;
}

type RoleMetrics = NonNullable<NonNullable<ModelMetrics['roles']>[LlmRole]>;

interface ModelStatsDisplayProps {
  selectedAuthType?: string;
  userEmail?: string;
  tier?: string;
  currentModel?: string;
  quotaStats?: QuotaStats;
}

export const ModelStatsDisplay: React.FC<ModelStatsDisplayProps> = ({
  selectedAuthType,
  userEmail,
  tier,
  currentModel,
  quotaStats,
}) => {
  const { stats } = useSessionStats();

  const pooledRemaining = quotaStats?.remaining;
  const pooledLimit = quotaStats?.limit;
  const pooledResetTime = quotaStats?.resetTime;

  const { models } = stats.metrics;
  const settings = useSettings();
  const showUserIdentity = settings.merged.ui.showUserIdentity;
  const activeModels = Object.entries(models).filter(
    ([, metrics]) => metrics.api.totalRequests > 0,
  );

  if (activeModels.length === 0) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        paddingTop={1}
        paddingX={2}
      >
        <Text color={theme.text.primary}>
          No API calls have been made in this session.
        </Text>
      </Box>
    );
  }

  const modelNames = activeModels.map(([name]) => name);

  const hasThoughts = activeModels.some(
    ([, metrics]) => metrics.tokens.thoughts > 0,
  );
  const hasTool = activeModels.some(([, metrics]) => metrics.tokens.tool > 0);
  const hasCached = activeModels.some(
    ([, metrics]) => metrics.tokens.cached > 0,
  );

  const allRoles = [
    ...new Set(
      activeModels.flatMap(([, metrics]) => Object.keys(metrics.roles ?? {})),
    ),
  ]
    .filter((role): role is LlmRole => {
      const validRoles: string[] = Object.values(LlmRole);
      return validRoles.includes(role);
    })
    .sort((a, b) => {
      if (a === b) return 0;
      if (a === LlmRole.MAIN) return -1;
      if (b === LlmRole.MAIN) return 1;
      return a.localeCompare(b);
    });

  // Helper to create a row with values for each model
  const createRow = (
    metric: string,
    getValue: (
      metrics: (typeof activeModels)[0][1],
    ) => string | React.ReactNode,
    options: { isSection?: boolean; isSubtle?: boolean } = {},
  ): StatRowData => {
    const row: StatRowData = {
      metric,
      isSection: options.isSection,
      isSubtle: options.isSubtle,
    };
    activeModels.forEach(([name, metrics]) => {
      row[name] = getValue(metrics);
    });
    return row;
  };

  const rows: StatRowData[] = [];

  // API Section
  rows.push({ metric: 'API', isSection: true });
  rows.push(createRow('Requests', (m) => m.api.totalRequests.toLocaleString()));
  rows.push(
    createRow('Errors', (m) => {
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
    }),
  );
  rows.push(
    createRow('Avg Latency', (m) => formatDuration(calculateAverageLatency(m))),
  );

  // Spacer
  rows.push({ metric: '' });

  // Tokens Section
  rows.push({ metric: 'Tokens', isSection: true });
  rows.push(
    createRow('Total', (m) => (
      <Text color={theme.text.secondary}>
        {m.tokens.total.toLocaleString()}
      </Text>
    )),
  );
  rows.push(
    createRow(
      'Input',
      (m) => (
        <Text color={theme.text.primary}>
          {m.tokens.input.toLocaleString()}
        </Text>
      ),
      { isSubtle: true },
    ),
  );

  if (hasCached) {
    rows.push(
      createRow(
        'Cache Reads',
        (m) => {
          const cacheHitRate = calculateCacheHitRate(m);
          return (
            <Text color={theme.text.secondary}>
              {m.tokens.cached.toLocaleString()} ({cacheHitRate.toFixed(1)}%)
            </Text>
          );
        },
        { isSubtle: true },
      ),
    );
  }

  if (hasThoughts) {
    rows.push(
      createRow(
        'Thoughts',
        (m) => (
          <Text color={theme.text.primary}>
            {m.tokens.thoughts.toLocaleString()}
          </Text>
        ),
        { isSubtle: true },
      ),
    );
  }

  if (hasTool) {
    rows.push(
      createRow(
        'Tool',
        (m) => (
          <Text color={theme.text.primary}>
            {m.tokens.tool.toLocaleString()}
          </Text>
        ),
        { isSubtle: true },
      ),
    );
  }

  rows.push(
    createRow(
      'Output',
      (m) => (
        <Text color={theme.text.primary}>
          {m.tokens.candidates.toLocaleString()}
        </Text>
      ),
      { isSubtle: true },
    ),
  );

  // Roles Section
  if (allRoles.length > 0) {
    // Spacer
    rows.push({ metric: '' });
    rows.push({ metric: 'Roles', isSection: true });

    allRoles.forEach((role) => {
      // Role Header Row
      const roleHeaderRow: StatRowData = {
        metric: role,
        isSection: true,
        color: theme.text.primary,
      };
      // We don't populate model values for the role header row
      rows.push(roleHeaderRow);

      const addRoleMetric = (
        metric: string,
        getValue: (r: RoleMetrics) => string | React.ReactNode,
      ) => {
        const row: StatRowData = {
          metric,
          isSubtle: true,
        };
        activeModels.forEach(([name, metrics]) => {
          const roleMetrics = metrics.roles?.[role];
          if (roleMetrics) {
            row[name] = getValue(roleMetrics);
          } else {
            row[name] = <Text color={theme.text.secondary}>-</Text>;
          }
        });
        rows.push(row);
      };

      addRoleMetric('Requests', (r) => r.totalRequests.toLocaleString());
      addRoleMetric('Input', (r) => (
        <Text color={theme.text.primary}>
          {r.tokens.input.toLocaleString()}
        </Text>
      ));
      addRoleMetric('Output', (r) => (
        <Text color={theme.text.primary}>
          {r.tokens.candidates.toLocaleString()}
        </Text>
      ));
      addRoleMetric('Cache Reads', (r) => (
        <Text color={theme.text.secondary}>
          {r.tokens.cached.toLocaleString()}
        </Text>
      ));
    });
  }

  const columns: Array<Column<StatRowData>> = [
    {
      key: 'metric',
      header: 'Metric',
      width: 28,
      renderCell: (row) => (
        <Text
          bold={row.isSection}
          color={row.isSection ? theme.text.primary : theme.text.link}
        >
          {row.isSubtle ? `  ↳ ${row.metric}` : row.metric}
        </Text>
      ),
    },
    ...modelNames.map((name) => ({
      key: name,
      header: name,
      flexGrow: 1,
      renderCell: (row: StatRowData) => {
        // Don't render anything for section headers in model columns
        if (row.isSection) return null;
        const val = row[name];
        if (val === undefined || val === null) return null;
        if (typeof val === 'string' || typeof val === 'number') {
          return <Text color={theme.text.primary}>{val}</Text>;
        }
        return val as React.ReactNode;
      },
    })),
  ];

  const isAuto = currentModel && isAutoModel(currentModel);
  const statsTitle = isAuto
    ? `${getDisplayString(currentModel)} Stats For Nerds`
    : 'Model Stats For Nerds';

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
    >
      <Text bold color={theme.text.accent}>
        {statsTitle}
      </Text>
      <Box height={1} />

      {showUserIdentity && selectedAuthType && (
        <Box>
          <Box width={28}>
            <Text color={theme.text.link}>Auth Method:</Text>
          </Box>
          <Text color={theme.text.primary}>
            {selectedAuthType.startsWith('oauth')
              ? userEmail
                ? `Logged in with Google (${userEmail})`
                : 'Logged in with Google'
              : selectedAuthType}
          </Text>
        </Box>
      )}
      {showUserIdentity && tier && (
        <Box>
          <Box width={28}>
            <Text color={theme.text.link}>Tier:</Text>
          </Box>
          <Text color={theme.text.primary}>{tier}</Text>
        </Box>
      )}
      {isAuto &&
        pooledRemaining !== undefined &&
        pooledLimit !== undefined &&
        pooledLimit > 0 && (
          <QuotaStatsInfo
            remaining={pooledRemaining}
            limit={pooledLimit}
            resetTime={pooledResetTime}
          />
        )}
      {(showUserIdentity || isAuto) && <Box height={1} />}

      <Table data={rows} columns={columns} />
    </Box>
  );
};
