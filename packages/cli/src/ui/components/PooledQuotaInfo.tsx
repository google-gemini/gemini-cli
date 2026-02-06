/**
 * @license
 * Copyright 2025 Google LLC
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

interface PooledQuotaInfoProps {
  remaining: number;
  limit: number;
  resetTime?: string;
  showBreakdownNotice?: boolean;
  marginBottom?: number;
}

export const PooledQuotaInfo: React.FC<PooledQuotaInfoProps> = ({
  remaining,
  limit,
  resetTime,
  showBreakdownNotice = false,
  marginBottom = 1,
}) => {
  if (limit <= 0) {
    return null;
  }

  const percentage = (remaining / limit) * 100;
  const color = getStatusColor(percentage, {
    green: QUOTA_THRESHOLD_HIGH + 0.01, // 20% should be yellow
    yellow: QUOTA_THRESHOLD_MEDIUM,
  });

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={marginBottom}>
      <Text color={color}>
        {remaining === 0
          ? `Limit reached`
          : `${percentage.toFixed(0)}% usage remaining`}
        {resetTime && `, ${formatResetTime(resetTime)}`}
      </Text>
      <Text color={theme.text.primary}>
        Usage limit: {limit.toLocaleString()}
      </Text>
      <Text color={theme.text.primary}>
        Usage limits span all sessions and reset daily.
      </Text>
      {remaining === 0 ? (
        <Text color={theme.text.primary}>
          Please /auth to upgrade or switch to an API key to continue.
        </Text>
      ) : (
        <Text color={theme.text.primary}>
          /auth to upgrade or switch to API key.
        </Text>
      )}
      {showBreakdownNotice && (
        <Text color={theme.text.primary}>
          For a full token breakdown, run `/stats model`.
        </Text>
      )}
    </Box>
  );
};
