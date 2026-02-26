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
  if (remaining === undefined || limit === undefined || limit === 0) {
    return null;
  }

  const percentage = (remaining / limit) * 100;
  const color = getStatusColor(percentage, {
    green: QUOTA_THRESHOLD_HIGH,
    yellow: QUOTA_THRESHOLD_MEDIUM,
  });

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      <Text color={color}>
        {remaining === 0
          ? `Limit reached`
          : `${percentage.toFixed(0)}% usage remaining`}
        {resetTime && `, ${formatResetTime(resetTime)}`}
      </Text>
      {showDetails && (
        <>
          <Text color={theme.text.primary}>
            Usage limit: {limit.toLocaleString()}
          </Text>
          <Text color={theme.text.primary}>
            Usage limits span all sessions and reset daily.
          </Text>
          {remaining === 0 && (
            <Text color={theme.text.primary}>
              Please /auth to upgrade or switch to an API key to continue.
            </Text>
          )}
        </>
      )}
    </Box>
  );
};
