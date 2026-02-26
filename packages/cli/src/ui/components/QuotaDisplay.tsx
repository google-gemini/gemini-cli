/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import {
  getStatusColor,
  QUOTA_THRESHOLD_HIGH,
  QUOTA_THRESHOLD_MEDIUM,
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

  const percentage = (remaining / limit) * 100;

  if (percentage > QUOTA_THRESHOLD_HIGH) {
    return null;
  }

  const color = getStatusColor(percentage, {
    green: QUOTA_THRESHOLD_HIGH,
    yellow: QUOTA_THRESHOLD_MEDIUM,
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
        ? `${percentage.toFixed(0)}%`
        : `/stats ${percentage.toFixed(0)}% usage remaining${resetInfo}`}
    </Text>
  );
};
