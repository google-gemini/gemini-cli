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

import {
  type RetrieveUserQuotaResponse,
  isActiveModel,
} from '@google/gemini-cli-core';

interface QuotaStatsInfoProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  showDetails?: boolean;
  quotas?: RetrieveUserQuotaResponse;
  useGemini3_1?: boolean;
  useCustomToolModel?: boolean;
}

export const QuotaStatsInfo: React.FC<QuotaStatsInfoProps> = ({
  remaining,
  limit,
  resetTime,
  showDetails = true,
  quotas,
  useGemini3_1 = false,
  useCustomToolModel = false,
}) => {
  let displayPercentage =
    limit && limit > 0 && remaining !== undefined && remaining !== null
      ? (remaining / limit) * 100
      : undefined;

  let displayResetTime = resetTime;

  // Fallback to individual bucket if pooled data is missing
  if (displayPercentage === undefined && quotas?.buckets) {
    const activeBuckets = quotas.buckets.filter(
      (b) =>
        b.modelId &&
        isActiveModel(b.modelId, useGemini3_1, useCustomToolModel) &&
        b.remainingFraction !== undefined,
    );
    if (activeBuckets.length > 0) {
      // Use the most restrictive bucket as representative
      const representative = activeBuckets.reduce((prev, curr) =>
        prev.remainingFraction! < curr.remainingFraction! ? prev : curr,
      );
      displayPercentage = representative.remainingFraction! * 100;
      displayResetTime = representative.resetTime;
    }
  }

  if (displayPercentage === undefined && !showDetails) {
    return null;
  }

  const color =
    displayPercentage !== undefined
      ? getStatusColor(displayPercentage, {
          green: QUOTA_THRESHOLD_HIGH,
          yellow: QUOTA_THRESHOLD_MEDIUM,
        })
      : theme.text.primary;

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={0}>
      {displayPercentage !== undefined && (
        <Text color={color}>
          <Text bold>
            {displayPercentage === 0
              ? `Limit reached`
              : `${displayPercentage.toFixed(0)}%`}
          </Text>
          {displayPercentage !== 0 && <Text> usage remaining</Text>}
          {displayResetTime &&
            `, ${(function (t) {
              const formatted = formatResetTime(t);
              return formatted === 'Resetting...' || formatted === '< 1m'
                ? formatted
                : `resets in ${formatted}`;
            })(displayResetTime)}`}
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
