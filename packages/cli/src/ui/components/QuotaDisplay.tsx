/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import {
  getUsedStatusColor,
  QUOTA_USED_WARNING_THRESHOLD,
  QUOTA_USED_CRITICAL_THRESHOLD,
} from '../utils/displayUtils.js';
import { formatResetTime } from '../utils/formatters.js';

interface QuotaDisplayProps {
  remaining: number | undefined;
  limit: number | undefined;
  resetTime?: string;
  terse?: boolean;
}

export const QuotaDisplay: React.FC<QuotaDisplayProps> = ({
  remaining,
  limit,
  resetTime,
  terse = false,
}) => {
  if (remaining === undefined || limit === undefined || limit === 0) {
    return null;
  }

  const usedPercentage = 100 - (remaining / limit) * 100;

  if (usedPercentage < QUOTA_USED_WARNING_THRESHOLD) {
    return null;
  }

  const color = getUsedStatusColor(usedPercentage, {
    warning: QUOTA_USED_WARNING_THRESHOLD,
    critical: QUOTA_USED_CRITICAL_THRESHOLD,
  });

  const resetInfo =
    !terse && resetTime ? `, ${formatResetTime(resetTime)}` : '';

  if (remaining === 0) {
    return (
      <Text color={color}>
        {terse
          ? 'Limit reached'
          : `/stats Limit reached${resetInfo}${!terse && '. /auth to continue.'}`}
      </Text>
    );
  }

  return (
    <Text color={color}>
      {terse
        ? `${usedPercentage.toFixed(0)}%`
        : `/stats ${usedPercentage.toFixed(0)}% used${resetInfo}`}
    </Text>
  );
};
