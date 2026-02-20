/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { formatResetTime } from '../utils/formatters.js';
import {
  getStatusColor,
  QUOTA_THRESHOLD_HIGH,
  QUOTA_THRESHOLD_MEDIUM,
} from '../utils/displayUtils.js';

interface QuotaStatsInfoProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  showDetails?: boolean;
}

export const QuotaStatsInfo: React.FC<QuotaStatsInfoProps> = ({
  remaining,
  limit,
  resetTime,
  showDetails = true,
}) => {
  const hasData =
    (remaining !== undefined && remaining !== null) ||
    (limit !== undefined && limit !== null && limit > 0);

  if (!hasData && !showDetails) {
    return null;
  }

  const percentage =
    limit && limit > 0 && remaining !== undefined && remaining !== null
      ? (remaining / limit) * 100
      : undefined;

  const color =
    percentage !== undefined
      ? getStatusColor(percentage, {
          green: QUOTA_THRESHOLD_HIGH,
          yellow: QUOTA_THRESHOLD_MEDIUM,
        })
      : theme.text.primary;

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      {hasData && (
        <Text color={color}>
          <Text bold>
            {remaining === 0
              ? `Limit reached`
              : percentage !== undefined
                ? `${percentage.toFixed(0)}%`
                : 'Limit reached'}
          </Text>
          {remaining !== 0 && <Text> usage remaining</Text>}
          {resetTime &&
            `, ${(function (t) {
              const formatted = formatResetTime(t);
              return formatted === 'Resetting...' || formatted === '< 1m'
                ? formatted
                : `resets in ${formatted}`;
            })(resetTime)}`}
        </Text>
      )}
      {showDetails && (
        <>
          <Text color={theme.text.primary}>
            Usage limits span all sessions and reset daily.
          </Text>
          <Text color={theme.text.primary}>
            /auth to upgrade or switch to API key.
          </Text>
        </>
      )}
    </Box>
  );
};
